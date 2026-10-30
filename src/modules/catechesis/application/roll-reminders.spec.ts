import { beforeEach, describe, expect, it } from "vitest";

import { NotAnApprovedCatechistError } from "../domain/errors/catechesis.errors.js";
import { isWithinReminderWindow, rollDeadline, sessionDayLabel } from "../domain/roll-deadline.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
let classId: string;

/** Põe o relógio dos testes num instante (ISO, UTC). */
const at = (iso: string) => ctx.clock.advance(new Date(iso).getTime() - ctx.clock.now().getTime());

beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
  ctx.people.add({
    id: IDS.coordinator,
    fullName: "Teresa Domingos",
    email: "teresa@exemplo.ao",
  });
  ctx.people.add({
    id: IDS.catechist,
    fullName: "Maria José",
    roles: ["CATECHIST"],
    approvedCatechist: true,
    email: "maria@exemplo.ao",
  });
  // Comunhão 1.º ano A, sábado de manhã: encontros a 26/09, 03/10, 10/10…
  const klass = await ctx.classWithCatechist();
  await ctx.assign.execute({
    actorId: IDS.coordinator,
    classId: klass.id,
    catechists: [
      { accountId: IDS.catechist, role: "LEAD" },
      { accountId: IDS.both, role: "ASSISTANT" },
    ],
  });
  classId = klass.id;
  ctx.notifier.messages.length = 0;
});

describe("Prazo da chamada", () => {
  it("é às 23:59:59 do dia do encontro, hora de Luanda", () => {
    expect(rollDeadline("2026-10-10").toISOString()).toBe("2026-10-10T22:59:59.000Z");
    expect(sessionDayLabel("2026-10-10")).toBe("sábado, 10/10");
    expect(sessionDayLabel("2026-10-11")).toBe("domingo, 11/10");
    // Avisa só nas 24 horas seguintes ao prazo.
    expect(isWithinReminderWindow("2026-10-10", new Date("2026-10-10T22:59:59.000Z"))).toBe(false);
    expect(isWithinReminderWindow("2026-10-10", new Date("2026-10-10T23:00:00.000Z"))).toBe(true);
    expect(isWithinReminderWindow("2026-10-10", new Date("2026-10-11T22:59:58.000Z"))).toBe(true);
    expect(isWithinReminderWindow("2026-10-10", new Date("2026-10-11T22:59:59.000Z"))).toBe(false);
  });

  it("lista os encontros em atraso sem chamada, mais recentes primeiro", async () => {
    await ctx.attendance.save({
      classId,
      date: "2026-10-03",
      marks: [],
      recordedBy: IDS.catechist,
      recordedAt: ctx.clock.now(),
    });
    // Terça, 13/10.
    const { items } = await ctx.rolls.pending.execute();
    expect(items).toEqual([
      {
        classId,
        classLabel: "Comunhão · 1.º ano · A",
        date: "2026-10-10",
        deadline: "2026-10-10T22:59:59.000Z",
        daysLate: 3,
        catechists: [
          { accountId: IDS.catechist, name: "Maria José" },
          { accountId: IDS.both, name: "Joana Kiala" },
        ],
        alertedAt: null,
      },
      expect.objectContaining({ date: "2026-09-26", daysLate: 17 }),
    ]);

    // Ainda no sábado (23:59 em Luanda): o prazo não passou.
    at("2026-10-10T22:59:00.000Z");
    expect((await ctx.rolls.pending.execute()).items.map((item) => item.date)).toEqual([
      "2026-09-26",
    ]);
  });

  it("o catequista vê só as suas turmas", async () => {
    const mine = await ctx.rolls.mine.execute({ accountId: IDS.catechist });
    expect(mine.items.map((item) => item.date)).toEqual(["2026-10-10", "2026-10-03", "2026-09-26"]);
    await ctx.assign.execute({
      actorId: IDS.coordinator,
      classId,
      catechists: [{ accountId: IDS.catechist, role: "LEAD" }],
    });
    expect((await ctx.rolls.mine.execute({ accountId: IDS.both })).items).toEqual([]);
    await expect(ctx.rolls.mine.execute({ accountId: IDS.pending })).rejects.toThrow(
      NotAnApprovedCatechistError,
    );
  });
});

describe("Alertas de chamada por lançar", () => {
  it("avisa cada catequista e a coordenação uma só vez, nas 24 horas a seguir ao prazo", async () => {
    // 00:30 de domingo em Luanda: o encontro de sábado, 10/10, passou o prazo.
    at("2026-10-10T23:30:00.000Z");
    const result = await ctx.rolls.remind.execute();
    expect(result.failures).toEqual([]);
    expect(result.alerted.map((item) => item.date)).toEqual(["2026-10-10"]);

    const text =
      "Ainda não lançaste a chamada do encontro de sábado, 10/10, da turma Comunhão · 1.º ano · A. Lança-a assim que possível.";
    const link = `/portal/presencas?turma=${classId}&data=2026-10-10`;
    const reminders = ctx.notifier.messages.filter((m) => m.kind === "catechesis.roll_reminder");
    expect(reminders).toEqual([
      {
        to: { accountIds: [IDS.catechist] },
        kind: "catechesis.roll_reminder",
        title: "Chamada por lançar: sábado, 10/10",
        body: text,
        link,
        email: false,
      },
      expect.objectContaining({ to: { accountIds: [IDS.both] }, link }),
    ]);
    // Mensagem automática (sem remetente) na conversa de coordenação de cada um.
    expect(ctx.messenger.messages).toEqual([
      { toAccountId: IDS.catechist, body: text },
      { toAccountId: IDS.both, body: text },
    ]);
    // Email próprio só a quem tem email.
    expect(ctx.mailer.rollReminders).toEqual([
      {
        email: "maria@exemplo.ao",
        firstName: "Maria",
        classLabel: "Comunhão · 1.º ano · A",
        dayLabel: "sábado, 10/10",
        link,
      },
    ]);

    // Um resumo para a coordenação.
    expect(ctx.notifier.last("catechesis.pending_rolls")).toEqual({
      to: { permission: "COORDINATION" },
      kind: "catechesis.pending_rolls",
      title: "1 chamada por lançar",
      body: "sábado, 10/10 · Comunhão · 1.º ano · A (Maria José, Joana Kiala)",
      link: "/dashboard/presencas?data=2026-10-10",
      email: false,
    });
    expect(ctx.mailer.pendingRollsDigests).toEqual([
      {
        email: "teresa@exemplo.ao",
        firstName: "Teresa",
        items: [
          {
            classLabel: "Comunhão · 1.º ano · A",
            dayLabel: "sábado, 10/10",
            catechists: ["Maria José", "Joana Kiala"],
          },
        ],
        link: "/dashboard/presencas?data=2026-10-10",
      },
    ]);

    // Idempotente: a execução seguinte (15 minutos depois) não repete nada.
    const sent = ctx.notifier.messages.length;
    ctx.clock.advance(15 * 60 * 1000);
    expect((await ctx.rolls.remind.execute()).alerted).toEqual([]);
    expect(ctx.notifier.messages).toHaveLength(sent);
    expect(ctx.messenger.messages).toHaveLength(2);
    const [pending] = (await ctx.rolls.pending.execute()).items;
    expect(pending.alertedAt).toBe("2026-10-10T23:30:00.000Z");
  });

  it("não avisa antes do prazo, depois das 24 horas, nem com a chamada lançada", async () => {
    at("2026-10-10T22:59:00.000Z");
    expect((await ctx.rolls.remind.execute()).alerted).toEqual([]);
    // Terça: os encontros em atraso já passaram as 24 horas (ficam só na lista).
    at("2026-10-13T10:00:00.000Z");
    expect((await ctx.rolls.remind.execute()).alerted).toEqual([]);
    expect(ctx.reminders.items.size).toBe(0);

    at("2026-10-17T23:10:00.000Z");
    await ctx.attendance.save({
      classId,
      date: "2026-10-17",
      marks: [],
      recordedBy: IDS.catechist,
      recordedAt: ctx.clock.now(),
    });
    expect((await ctx.rolls.remind.execute()).alerted).toEqual([]);
    expect(ctx.notifier.messages).toEqual([]);
  });

  it("uma falha no chat não para os restantes avisos", async () => {
    ctx.messenger.failing = true;
    at("2026-10-10T23:30:00.000Z");
    const result = await ctx.rolls.remind.execute();
    expect(result.alerted).toHaveLength(1);
    expect(result.failures).toEqual([
      `mensagem a ${IDS.catechist}: chat indisponível`,
      `mensagem a ${IDS.both}: chat indisponível`,
    ]);
    expect(ctx.notifier.kinds()).toEqual([
      "catechesis.roll_reminder",
      "catechesis.roll_reminder",
      "catechesis.pending_rolls",
    ]);
  });
});

describe("Presença do catequista registada pela coordenação", () => {
  const mark = (status: "PRESENT" | "ABSENT" | "JUSTIFIED", date = "2026-10-10") =>
    ctx.setPresence.execute({ actorId: IDS.coordinator, classId, date, status });

  it("avisa o principal (chat em nome de quem marcou) só quando o estado é novo ou muda", async () => {
    await mark("PRESENT");
    expect(ctx.messenger.messages).toEqual([
      {
        toAccountId: IDS.catechist,
        fromAccountId: IDS.coordinator,
        body: "Registei a tua presença no encontro de sábado, 10/10 (Comunhão · 1.º ano · A).",
      },
    ]);
    expect(ctx.notifier.last("catechesis.catechist_presence")).toEqual({
      to: { accountIds: [IDS.catechist] },
      kind: "catechesis.catechist_presence",
      title: "Presença registada: sábado, 10/10",
      body: "Registei a tua presença no encontro de sábado, 10/10 (Comunhão · 1.º ano · A).",
      link: `/portal/mensagens?c=conv-${IDS.catechist}`,
    });

    // O mesmo estado outra vez: nada de novo.
    await mark("PRESENT");
    expect(ctx.messenger.messages).toHaveLength(1);
    expect(ctx.notifier.kinds()).toEqual(["catechesis.catechist_presence"]);

    await mark("ABSENT");
    expect(ctx.messenger.messages.at(-1)?.body).toBe(
      "Registei uma falta tua no encontro de sábado, 10/10 (Comunhão · 1.º ano · A). Se houver engano ou motivo, responde a esta mensagem.",
    );
    await mark("JUSTIFIED");
    expect(ctx.notifier.last("catechesis.catechist_presence")).toMatchObject({
      title: "Falta justificada: sábado, 10/10",
      body: "Registei a tua falta como justificada no encontro de sábado, 10/10 (Comunhão · 1.º ano · A).",
    });
    // Só o principal (a auxiliar não é avisada).
    expect(ctx.messenger.messages.every((m) => m.toAccountId === IDS.catechist)).toBe(true);
  });

  it("sem chat, a notificação aponta para o portal", async () => {
    ctx.messenger.failing = true;
    await mark("ABSENT", "2026-10-03");
    expect(ctx.notifier.last("catechesis.catechist_presence")).toMatchObject({
      title: "Falta registada: sábado, 03/10",
      link: "/portal",
    });
  });
});
