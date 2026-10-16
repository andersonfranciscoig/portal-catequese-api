import { beforeEach, describe, expect, it } from "vitest";

import { CalendarActivityNotFoundError } from "../domain/errors/catechesis.errors.js";
import { easterVigil } from "../domain/sacraments.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

describe("Calendário do portal", () => {
  it("mostra o Batismo e só as atividades da audiência", async () => {
    await ctx.calendarActivities.save.execute({
      actorId: IDS.coordinator,
      title: "Reunião de pais",
      description: "Salão paroquial, às 18:30.",
      kind: "MEETING",
      audience: "GUARDIANS",
      startsOn: "2026-11-12",
    });
    await ctx.calendarActivities.save.execute({
      actorId: IDS.coordinator,
      title: "Formação de catequistas",
      description: "Encontro só para quem dá catequese.",
      kind: "CATECHESIS",
      audience: "CATECHISTS",
      startsOn: "2026-11-05",
    });
    await ctx.calendarActivities.save.execute({
      actorId: IDS.coordinator,
      title: "Missa de envio",
      description: "Abertura do ano, missa das 09:00.",
      kind: "CELEBRATION",
      audience: "ALL",
      startsOn: "2026-10-18",
    });

    const guardian = await ctx.calendarActivities.portal.execute({
      roles: ["GUARDIAN"],
      role: "GUARDIAN",
    });
    expect(guardian.map((item) => item.title)).toEqual([
      "Missa de envio",
      "Reunião de pais",
      "Batismo",
    ]);
    expect(guardian.find((item) => item.title === "Batismo")).toMatchObject({
      kind: "SACRAMENT",
      startsAt: easterVigil(2027),
    });

    const catechist = await ctx.calendarActivities.portal.execute({
      roles: ["CATECHIST"],
      role: "CATECHIST",
    });
    expect(catechist.map((item) => item.title)).toEqual([
      "Missa de envio",
      "Formação de catequistas",
      "Batismo",
    ]);

    const publicEvents = await ctx.calendarActivities.portal.listShared();
    expect(publicEvents.map((item) => item.title)).toEqual(["Missa de envio", "Batismo"]);
  });

  it("altera e retira uma atividade", async () => {
    const created = await ctx.calendarActivities.save.execute({
      actorId: IDS.coordinator,
      title: "Ensaio de Natal",
      description: "Turmas do 1.º e 2.º ano.",
      kind: "CELEBRATION",
      audience: "ALL",
      startsOn: "2026-12-10",
      endsOn: "2026-12-12",
    });
    const changed = await ctx.calendarActivities.save.execute({
      actorId: IDS.coordinator,
      id: created.id,
      title: "Auto de Natal",
      description: "Todas as turmas, no salão.",
      kind: "CELEBRATION",
      audience: "GUARDIANS",
      startsOn: "2026-12-12",
    });
    expect(changed.audience).toBe("GUARDIANS");
    expect(changed.endsOn).toBeUndefined();

    await ctx.calendarActivities.remove.execute({ actorId: IDS.coordinator, id: created.id });
    await expect(
      ctx.calendarActivities.remove.execute({ actorId: IDS.coordinator, id: created.id }),
    ).rejects.toBeInstanceOf(CalendarActivityNotFoundError);
  });
});
