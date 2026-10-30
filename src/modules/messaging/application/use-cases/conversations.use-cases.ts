import type { CatechesisRelations } from "../../../../shared/application/catechesis-relations.js";
import type { ContactDirectory } from "../../../../shared/application/contact-directory.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import {
  decideStart,
  isStaff,
  luandaToday,
  staffCenterFilter,
  type ChatTarget,
} from "../../domain/chat-policy.js";
import { SEDE_CENTER_ID } from "../../../../shared/domain/parish-centers.js";
import { CenterForbiddenError } from "../../domain/errors.js";
import { Conversation } from "../../domain/conversation.js";
import { ConversationNotAllowedError } from "../../domain/errors.js";
import type { ConversationRepository } from "../../domain/repositories/messaging.repositories.js";
import type { ChatAccess } from "../chat-access.js";
import { peopleIn, toConversationView, type ConversationView } from "../views.js";

/** Máximo de conversas na lista (as mais recentes). */
const LIST_LIMIT = 200;

function coordinationCenter(
  viewer: Parameters<typeof staffCenterFilter>[0],
  requested?: string,
): string {
  const own = staffCenterFilter(viewer);
  if (own) {
    if (requested && requested !== own) throw new CenterForbiddenError();
    return own;
  }
  return requested ?? SEDE_CENTER_ID;
}

/** Conversas de quem pede, mais recentes primeiro (a equipa vê todas as da coordenação). */
export class ListConversationsUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(input: { accountId: string }): Promise<{ items: ConversationView[] }> {
    const viewer = await this.access.viewer(input.accountId);
    const found = await this.conversations.listVisibleTo(
      viewer.id,
      isStaff(viewer),
      LIST_LIMIT,
      staffCenterFilter(viewer),
    );
    const ids = found.map((conversation) => conversation.id.value);
    const [unread, people] = await Promise.all([
      this.conversations.unreadCounts(viewer.id, ids),
      this.access.people(peopleIn(found)),
    ]);
    return {
      items: found.map((conversation) =>
        toConversationView(conversation, viewer.id, people, unread.get(conversation.id.value) ?? 0),
      ),
    };
  }
}

/** Quantas conversas têm mensagens por ler. */
export class CountUnreadConversationsUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(input: { accountId: string }): Promise<{ count: number }> {
    const viewer = await this.access.viewer(input.accountId);
    const found = await this.conversations.listVisibleTo(
      viewer.id,
      isStaff(viewer),
      LIST_LIMIT,
      staffCenterFilter(viewer),
    );
    const unread = await this.conversations.unreadCounts(
      viewer.id,
      found.map((conversation) => conversation.id.value),
    );
    return { count: [...unread.values()].filter((count) => count > 0).length };
  }
}

export type StartRecipient =
  | { kind: "coordination"; centerId?: string }
  | { kind: "account"; accountId: string };

/**
 * Abre (ou reabre) uma conversa, se a matriz de permissões o permitir.
 * Idempotente: uma conversa direta por par e uma com a coordenação por conta.
 */
export class StartConversationUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly directory: ContactDirectory,
    private readonly relations: CatechesisRelations,
    private readonly conversations: ConversationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    accountId: string;
    recipient: StartRecipient;
    centerId?: string;
  }): Promise<ConversationView> {
    const viewer = await this.access.viewer(input.accountId);
    let target: ChatTarget;
    if (input.recipient.kind === "coordination") {
      target = { kind: "coordination" };
    } else {
      const [person] = await this.directory.findMany([input.recipient.accountId]);
      if (!person) throw new ConversationNotAllowedError();
      target = { kind: "account", person };
    }
    // Só a equipa e quem fala com outra conta precisam das relações da catequese.
    const relations =
      target.kind === "account" && !isStaff(viewer)
        ? await this.relations.relationsOf(viewer.id)
        : [];
    const decision = decideStart(viewer, target, relations, luandaToday(this.clock.now()));
    if (!decision.allowed) throw new ConversationNotAllowedError();

    const now = this.clock.now();
    const centerId =
      decision.kind === "COORDINATION" ? coordinationCenter(viewer, input.centerId) : undefined;
    const conversation =
      decision.kind === "DIRECT"
        ? ((await this.conversations.findDirect(
            Conversation.directKeyFor(viewer.id, decision.otherId),
          )) ??
          (await this.conversations.create(Conversation.direct(viewer.id, decision.otherId, now))))
        : ((await this.conversations.findCoordination(decision.subjectId, centerId)) ??
          (await this.conversations.create(
            Conversation.coordination(decision.subjectId, now, centerId),
          )));

    const id = conversation.id.value;
    const [unread, people] = await Promise.all([
      this.conversations.unreadCounts(viewer.id, [id]),
      this.access.people(peopleIn([conversation])),
    ]);
    return toConversationView(conversation, viewer.id, people, unread.get(id) ?? 0);
  }
}
