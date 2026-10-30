import { beforeEach, describe, expect, it } from "vitest";

import {
  CatechesisRelations,
  type CatechesisRelation,
} from "../../../shared/application/catechesis-relations.js";
import {
  ContactDirectory,
  type ContactPerson,
} from "../../../shared/application/contact-directory.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import {
  RecordingPushNotifier,
  RecordingRealtimeBus,
} from "../../../shared/testing/recording-realtime.js";
import { ConversationNotAllowedError, ConversationNotFoundError } from "../domain/errors.js";
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
} from "../infrastructure/persistence/in-memory-messaging.repositories.js";
import { ChatAccess } from "./chat-access.js";
import { ListContactsUseCase } from "./use-cases/contacts.use-case.js";
import {
  CountUnreadConversationsUseCase,
  ListConversationsUseCase,
  StartConversationUseCase,
  type StartRecipient,
} from "./use-cases/conversations.use-cases.js";
import {
  ListMessagesUseCase,
  MarkConversationReadUseCase,
  SendMessageUseCase,
} from "./use-cases/messages.use-cases.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const GUARDIAN = id(1);
const CATECHIST = id(2);
const OTHER_CATECHIST = id(3);
const ADULT = id(4);
const MINOR = id(5);
const COORDINATOR = id(6);
const ADMIN = id(7);
const OTHER_GUARDIAN = id(8);
const BLOCKED = id(9);
const COORDINATOR_2 = id(10);

const person = (
  accountId: string,
  fullName: string,
  roles: ContactPerson["roles"],
  staff: ContactPerson["staff"] = null,
  active = true,
): ContactPerson => ({ id: accountId, fullName, roles, staff, active });

const PEOPLE: ContactPerson[] = [
  person(GUARDIAN, "Maria Francisco", ["GUARDIAN"]),
  person(CATECHIST, "João Catequista", ["CATECHIST"]),
  person(OTHER_CATECHIST, "Pedro Outro", ["CATECHIST"]),
  person(ADULT, "Ana Adulta", ["CATECHUMEN"]),
  person(MINOR, "Rui Menor", ["CATECHUMEN"]),
  person(COORDINATOR, "Carla Coordenadora", ["CATECHIST"], "COORDINATION"),
  person(COORDINATOR_2, "Celso Coordenador", ["GUARDIAN"], "COORDINATION"),
  person(ADMIN, "Alberto Admin", [], "ADMIN"),
  person(OTHER_GUARDIAN, "Gil Sem Turma", ["GUARDIAN"]),
  person(BLOCKED, "Bruno Bloqueado", ["GUARDIAN"], null, false),
];

class Directory extends ContactDirectory {
  async findMany(ids: string[]) {
    return PEOPLE.filter((item) => ids.includes(item.id));
  }
  async staffIds() {
    return PEOPLE.filter((item) => item.staff && item.active).map((item) => item.id);
  }
  async search(term: string | undefined) {
    return PEOPLE.filter(
      (item) => item.active && (!term || item.fullName.toLowerCase().includes(term.toLowerCase())),
    );
  }
}

const rel = (
  accountId: string,
  kind: CatechesisRelation["kind"],
  catechumenName: string,
  catechumenBirthDate = "2016-05-01",
): CatechesisRelation => ({
  accountId,
  kind,
  catechumenName,
  catechumenBirthDate,
  classLabel: "Comunhão · 3.º ano",
});

// Turma do CATECHIST: a filha da GUARDIAN (menor), a ADULT (com conta) e o MINOR
// (com conta, 17 anos à data dos testes: 2026-10-13).
const RELATIONS: Record<string, CatechesisRelation[]> = {
  [GUARDIAN]: [rel(CATECHIST, "CATECHIST_OF_MY_CATECHUMEN", "Inês Francisco")],
  [CATECHIST]: [
    rel(GUARDIAN, "GUARDIAN_IN_MY_CLASS", "Inês Francisco"),
    rel(ADULT, "CATECHUMEN_IN_MY_CLASS", "Ana Adulta", "1990-01-01"),
    rel(MINOR, "CATECHUMEN_IN_MY_CLASS", "Rui Menor", "2008-10-14"),
  ],
  [ADULT]: [rel(CATECHIST, "MY_CATECHIST", "Ana Adulta", "1990-01-01")],
  [MINOR]: [rel(CATECHIST, "MY_CATECHIST", "Rui Menor", "2008-10-14")],
};

class Relations extends CatechesisRelations {
  async relationsOf(accountId: string) {
    return RELATIONS[accountId] ?? [];
  }
}

describe("Mensagens", () => {
  let clock: FixedClock;
  let messages: InMemoryMessageRepository;
  let conversations: InMemoryConversationRepository;
  let realtime: RecordingRealtimeBus;
  let push: RecordingPushNotifier;
  let start: StartConversationUseCase;
  let send: SendMessageUseCase;
  let read: MarkConversationReadUseCase;
  let list: ListConversationsUseCase;
  let unread: CountUnreadConversationsUseCase;
  let page: ListMessagesUseCase;
  let contacts: ListContactsUseCase;

  beforeEach(() => {
    clock = new FixedClock();
    messages = new InMemoryMessageRepository();
    conversations = new InMemoryConversationRepository(messages);
    realtime = new RecordingRealtimeBus();
    push = new RecordingPushNotifier();
    const directory = new Directory();
    const relations = new Relations();
    const access = new ChatAccess(directory, conversations);
    start = new StartConversationUseCase(access, directory, relations, conversations, clock);
    send = new SendMessageUseCase(access, conversations, messages, realtime, push, clock);
    read = new MarkConversationReadUseCase(access, conversations, realtime, clock);
    list = new ListConversationsUseCase(access, conversations);
    unread = new CountUnreadConversationsUseCase(access, conversations);
    page = new ListMessagesUseCase(access, messages);
    contacts = new ListContactsUseCase(access, directory, relations, clock);
  });

  const to = (accountId: string): StartRecipient => ({ kind: "account", accountId });
  const COORDINATION: StartRecipient = { kind: "coordination" };
  const open = (accountId: string, recipient: StartRecipient) =>
    start.execute({ accountId, recipient });
  const unreadOf = async (accountId: string, conversationId: string) =>
    (await list.execute({ accountId })).items.find((item) => item.id === conversationId)
      ?.unreadCount;

  describe("matriz de permissões", () => {
    const allowed: [string, string, StartRecipient, "direct" | "coordination"][] = [
      ["encarregado → coordenação", GUARDIAN, COORDINATION, "coordination"],
      ["encarregado → catequista do educando", GUARDIAN, to(CATECHIST), "direct"],
      ["catequista → coordenação", CATECHIST, COORDINATION, "coordination"],
      ["catequista → encarregado da turma", CATECHIST, to(GUARDIAN), "direct"],
      ["catequista → catequizando adulto da turma", CATECHIST, to(ADULT), "direct"],
      ["catequizando → o seu catequista", ADULT, to(CATECHIST), "direct"],
      ["catequizando → coordenação", ADULT, COORDINATION, "coordination"],
      [
        "coordenação → encarregado (conversa da coordenação)",
        COORDINATOR,
        to(GUARDIAN),
        "coordination",
      ],
      ["coordenação → qualquer conta ativa", COORDINATOR, to(OTHER_GUARDIAN), "coordination"],
      ["coordenação → administração (direta)", COORDINATOR, to(ADMIN), "direct"],
      ["administração → catequista", ADMIN, to(OTHER_CATECHIST), "coordination"],
    ];
    it.each(allowed)("permite %s", async (_, from, recipient, kind) => {
      expect((await open(from, recipient)).kind).toBe(kind);
    });

    const denied: [string, string, StartRecipient][] = [
      ["encarregado → catequista de outra turma", GUARDIAN, to(OTHER_CATECHIST)],
      ["encarregado → outro encarregado", GUARDIAN, to(OTHER_GUARDIAN)],
      ["encarregado → coordenador diretamente", GUARDIAN, to(COORDINATOR)],
      ["catequista → catequizando menor (mesmo com conta)", CATECHIST, to(MINOR)],
      ["catequista → encarregado de outra turma", CATECHIST, to(OTHER_GUARDIAN)],
      ["catequizando → outro catequista", ADULT, to(OTHER_CATECHIST)],
      ["encarregado sem turma → catequista", OTHER_GUARDIAN, to(CATECHIST)],
      ["coordenação → conta bloqueada", COORDINATOR, to(BLOCKED)],
      ["coordenação → a própria conta", COORDINATOR, to(COORDINATOR)],
      ["coordenação → caixa da coordenação", COORDINATOR, COORDINATION],
      ["conta desconhecida", COORDINATOR, to(id(99))],
      ["conta bloqueada → coordenação", BLOCKED, COORDINATION],
    ];
    it.each(denied)("recusa %s", async (_, from, recipient) => {
      await expect(open(from, recipient)).rejects.toThrow(ConversationNotAllowedError);
    });

    it("a conversa da coordenação mostra a equipa à conta e a conta à equipa", async () => {
      const mine = await open(GUARDIAN, COORDINATION);
      expect(mine).toMatchObject({ title: "Coordenação da catequese", counterpart: null });
      const theirs = await open(COORDINATOR, to(GUARDIAN));
      expect(theirs).toMatchObject({
        id: mine.id,
        title: "Maria Francisco",
        counterpart: { accountId: GUARDIAN, role: "GUARDIAN" },
      });
    });
  });

  it("cria as conversas uma só vez (idempotente, dos dois lados)", async () => {
    const first = await open(GUARDIAN, to(CATECHIST));
    expect((await open(GUARDIAN, to(CATECHIST))).id).toBe(first.id);
    expect((await open(CATECHIST, to(GUARDIAN))).id).toBe(first.id);

    const inbox = await open(GUARDIAN, COORDINATION);
    expect((await open(COORDINATOR, to(GUARDIAN))).id).toBe(inbox.id);
    expect((await open(ADMIN, to(GUARDIAN))).id).toBe(inbox.id);
    expect(conversations.items.size).toBe(2);

    const staff = await open(COORDINATOR, to(ADMIN));
    expect((await open(ADMIN, to(COORDINATOR))).id).toBe(staff.id);
  });

  it("só quem participa vê a conversa; a equipa vê todas as da coordenação", async () => {
    const direct = await open(GUARDIAN, to(CATECHIST));
    const inbox = await open(GUARDIAN, COORDINATION);
    await expect(
      send.execute({ accountId: COORDINATOR, conversationId: direct.id, body: "Olá" }),
    ).rejects.toThrow(ConversationNotFoundError);
    await expect(
      page.execute({ accountId: OTHER_GUARDIAN, conversationId: inbox.id }),
    ).rejects.toThrow(ConversationNotFoundError);

    expect((await list.execute({ accountId: COORDINATOR_2 })).items.map((c) => c.id)).toEqual([
      inbox.id,
    ]);
    expect((await list.execute({ accountId: CATECHIST })).items.map((c) => c.id)).toEqual([
      direct.id,
    ]);
  });

  it("conta as mensagens por ler de cada membro da equipa na conversa da coordenação", async () => {
    const inbox = await open(GUARDIAN, COORDINATION);
    clock.advance(1000);
    await send.execute({ accountId: GUARDIAN, conversationId: inbox.id, body: "Bom dia" });

    expect(await unreadOf(COORDINATOR, inbox.id)).toBe(1);
    expect(await unreadOf(COORDINATOR_2, inbox.id)).toBe(1);
    expect(await unreadOf(ADMIN, inbox.id)).toBe(1);
    expect(await unreadOf(GUARDIAN, inbox.id)).toBe(0);
    expect(await unread.execute({ accountId: COORDINATOR })).toEqual({ count: 1 });

    clock.advance(1000);
    await read.execute({ accountId: COORDINATOR, conversationId: inbox.id });
    expect(await unreadOf(COORDINATOR, inbox.id)).toBe(0);
    expect(await unreadOf(COORDINATOR_2, inbox.id)).toBe(1);
    expect(await unread.execute({ accountId: COORDINATOR })).toEqual({ count: 0 });
    expect(realtime.to(GUARDIAN, "conversation.read")).toEqual([
      { type: "conversation.read", data: { conversationId: inbox.id, accountId: COORDINATOR } },
    ]);

    clock.advance(1000);
    await send.execute({ accountId: COORDINATOR, conversationId: inbox.id, body: "Bom dia!" });
    expect(await unreadOf(GUARDIAN, inbox.id)).toBe(1);
    expect(await unreadOf(COORDINATOR, inbox.id)).toBe(0);
    expect(await unreadOf(COORDINATOR_2, inbox.id)).toBe(2);
    expect(await unread.execute({ accountId: GUARDIAN })).toEqual({ count: 1 });
  });

  it("entrega em tempo real e envia push a todos menos quem escreveu", async () => {
    const inbox = await open(GUARDIAN, COORDINATION);
    const sent = await send.execute({
      accountId: GUARDIAN,
      conversationId: inbox.id,
      body: `  ${"Preciso de ajuda com a matrícula. ".repeat(10)} `,
    });
    expect(sent.mine).toBe(true);
    expect(sent.sender).toEqual({ accountId: GUARDIAN, name: "Maria Francisco", role: "GUARDIAN" });

    expect(push.sent).toHaveLength(1);
    const [first] = push.sent;
    expect(first.accountIds.sort()).toEqual([ADMIN, COORDINATOR, COORDINATOR_2].sort());
    expect(first.payload).toMatchObject({
      kind: "message",
      title: "Maria Francisco",
      url: `/mensagens?c=${inbox.id}`,
      tag: `conv-${inbox.id}`,
    });
    expect(first.payload.body.length).toBeLessThanOrEqual(120);
    expect(first.payload.body.endsWith("…")).toBe(true);

    const [event] = realtime.to(COORDINATOR, "message.created");
    expect(event.data).toMatchObject({ conversationId: inbox.id, message: { mine: false } });
    expect(realtime.to(GUARDIAN, "message.created")[0].data).toMatchObject({
      message: { mine: true },
    });

    // A equipa responde: a conta vê "Coordenação da catequese"; a restante equipa, o nome.
    push.sent.length = 0;
    await send.execute({ accountId: COORDINATOR, conversationId: inbox.id, body: "Já vamos ver." });
    const byTitle = Object.fromEntries(
      push.sent.map((item) => [item.payload.title, item.accountIds]),
    );
    expect(byTitle["Coordenação da catequese"]).toEqual([GUARDIAN]);
    expect(byTitle["Carla Coordenadora"].sort()).toEqual([ADMIN, COORDINATOR_2].sort());

    // Conversa direta: só o outro.
    push.sent.length = 0;
    const direct = await open(CATECHIST, to(GUARDIAN));
    await send.execute({ accountId: CATECHIST, conversationId: direct.id, body: "Olá" });
    expect(push.sent).toEqual([
      {
        accountIds: [GUARDIAN],
        payload: {
          kind: "message",
          title: "João Catequista",
          body: "Olá",
          url: `/mensagens?c=${direct.id}`,
          tag: `conv-${direct.id}`,
        },
      },
    ]);
  });

  it("pagina as mensagens da mais antiga para a mais recente", async () => {
    const direct = await open(GUARDIAN, to(CATECHIST));
    for (const body of ["um", "dois", "três"]) {
      await send.execute({ accountId: GUARDIAN, conversationId: direct.id, body });
    }
    const last = await page.execute({ accountId: CATECHIST, conversationId: direct.id, limit: 2 });
    expect(last.items.map((item) => item.body)).toEqual(["dois", "três"]);
    expect(last.hasMore).toBe(true);
    const older = await page.execute({
      accountId: CATECHIST,
      conversationId: direct.id,
      before: last.items[0].id,
      limit: 2,
    });
    expect(older.items.map((item) => item.body)).toEqual(["um"]);
    expect(older.hasMore).toBe(false);

    const [conversation] = (await list.execute({ accountId: CATECHIST })).items;
    expect(conversation.lastMessage).toMatchObject({ body: "três", senderId: GUARDIAN });
    expect(conversation.unreadCount).toBe(3);
  });

  it("recusa mensagens vazias", async () => {
    const direct = await open(GUARDIAN, to(CATECHIST));
    await expect(
      send.execute({ accountId: GUARDIAN, conversationId: direct.id, body: "   " }),
    ).rejects.toThrow("vazia");
  });

  describe("contactos", () => {
    it("encarregado: a coordenação e os catequistas dos educandos", async () => {
      const { items } = await contacts.execute({ accountId: GUARDIAN });
      expect(items).toEqual([
        {
          kind: "coordination",
          accountId: null,
          name: "Coordenação da catequese",
          role: null,
          context: null,
        },
        {
          kind: "account",
          accountId: CATECHIST,
          name: "João Catequista",
          role: "CATECHIST",
          context: "Catequista de Inês Francisco · Comunhão · 3.º ano",
        },
      ]);
    });

    it("catequista: encarregados e só os catequizandos adultos", async () => {
      const { items } = await contacts.execute({ accountId: CATECHIST });
      expect(items.map((item) => item.accountId)).toEqual([null, ADULT, GUARDIAN]);
      const filtered = await contacts.execute({ accountId: CATECHIST, search: "maria" });
      expect(filtered.items.map((item) => item.accountId)).toEqual([GUARDIAN]);
    });

    it("equipa: todas as contas ativas, sem a própria", async () => {
      const { items } = await contacts.execute({ accountId: COORDINATOR });
      const ids = items.map((item) => item.accountId);
      expect(ids).not.toContain(COORDINATOR);
      expect(ids).not.toContain(BLOCKED);
      expect(ids).toContain(OTHER_GUARDIAN);
      expect(items.find((item) => item.accountId === ADMIN)).toMatchObject({
        role: "ADMIN",
        context: "Administração",
      });
    });
  });
});
