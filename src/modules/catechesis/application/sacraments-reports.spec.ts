import { beforeEach, describe, expect, it } from "vitest";

import { toCsv } from "../../../shared/presentation/http/csv.js";
import type { CatechesisLevel } from "../domain/catechesis.js";
import {
  InvalidSacramentError,
  ReportNotAllowedError,
  SacramentCandidateNotFoundError,
} from "../domain/errors/catechesis.errors.js";
import { easterVigil } from "../domain/sacraments.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF");

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

/** Matrícula confirmada numa turma do nível (sábado de manhã). */
async function confirmedAt(
  level: CatechesisLevel,
  catechumen: { fullName: string; baptism?: boolean; firstCommunion?: boolean },
  section = "A",
  catechistId = IDS.catechist,
) {
  const klass = await ctx.createClass.execute({
    actorId: IDS.coordinator,
    level,
    section,
    slot: "SATURDAY_MORNING",
    startTime: "08:00",
    room: "Sala 01",
    capacity: 30,
  });
  await ctx.assign.execute({
    actorId: IDS.coordinator,
    classId: klass.id,
    catechists: [{ accountId: catechistId, role: "LEAD" }],
  });
  const enrollment = await ctx.submit.execute({
    accountId: IDS.guardian,
    guardian: { relationship: "FATHER" },
    catechumen: {
      fullName: catechumen.fullName,
      birthDate: "2015-03-10",
      gender: "FEMALE",
      sacraments: {
        baptism: catechumen.baptism ?? true,
        firstCommunion: catechumen.firstCommunion ?? false,
      },
    },
    catechesis: { type: "NEW", level, preferredSlot: "SATURDAY_MORNING" },
    allowLate: true,
  });
  await ctx.decide({
    actorId: IDS.coordinator,
    enrollmentId: enrollment.id,
    decision: "CONFIRMED",
    classId: klass.id,
  });
  return { klass, enrollment };
}

describe("Sacramentos", () => {
  it("celebrações do ano: o Batismo na Vigília Pascal, as outras por marcar", async () => {
    await confirmedAt("COMMUNION_3", { fullName: "Ana Comunhão" });
    const overview = await ctx.sacraments.overview.execute();
    expect(easterVigil(2027)).toBe("2027-03-27");
    expect(overview.celebrations).toEqual([
      expect.objectContaining({ type: "BAPTISM", date: "2027-03-27", scheduled: false }),
      expect.objectContaining({
        type: "FIRST_COMMUNION",
        date: undefined,
        level: "COMMUNION_3",
        candidates: 1,
        ready: 0,
      }),
      expect.objectContaining({ type: "CONFIRMATION", candidates: 0 }),
    ]);
    expect(overview.received).toEqual({ BAPTISM: 1, FIRST_COMMUNION: 0 });

    const set = await ctx.sacraments.setCelebration.execute({
      actorId: IDS.coordinator,
      type: "FIRST_COMMUNION",
      celebration: { date: "2027-05-30", place: "  Igreja Cristo Rei da Paz " },
    });
    expect(set).toMatchObject({
      date: "2027-05-30",
      place: "Igreja Cristo Rei da Paz",
      scheduled: true,
    });
    await expect(
      ctx.sacraments.setCelebration.execute({
        actorId: IDS.coordinator,
        type: "CONFIRMATION",
        celebration: { date: "2027-09-01", place: "Sé Catedral" },
      }),
    ).rejects.toThrow(InvalidSacramentError);
    const reset = await ctx.sacraments.setCelebration.execute({
      actorId: IDS.coordinator,
      type: "FIRST_COMMUNION",
      celebration: null,
    });
    expect(reset).toMatchObject({ date: undefined, scheduled: false });
    expect(ctx.activity.entries.at(-1)?.summary).toBe("Retirou a data da Primeira Comunhão");
  });

  it("requisitos: o percurso e os documentos contam sozinhos; o resto marca a coordenação", async () => {
    const { enrollment } = await confirmedAt("COMMUNION_3", { fullName: "Ana Comunhão" });
    await ctx.saveRoll.execute({
      accountId: IDS.catechist,
      date: "2026-10-10",
      marks: [{ catechumenId: enrollment.catechumenId, status: "PRESENT" }],
    });
    let [candidate] = (await ctx.sacraments.candidates.execute({ type: "FIRST_COMMUNION" })).items;
    expect(candidate).toMatchObject({
      fullName: "Ana Comunhão",
      classSection: "A",
      guardianName: "Anderson Francisco",
      attendanceRate: 100,
      ready: false,
    });
    expect(candidate.requirements).toEqual([
      { requirement: "BAPTIZED", met: true, source: "RECORD", editable: false },
      { requirement: "BAPTISM_CERTIFICATE", met: false, source: "MANUAL", editable: true },
      { requirement: "RECONCILIATION", met: false, source: "MANUAL", editable: true },
    ]);

    // A certidão enviada online cumpre o requisito.
    await ctx.upload.execute({
      accountId: IDS.guardian,
      enrollmentId: enrollment.id,
      kind: "BAPTISM",
      file: { name: "Certidão de batismo.pdf", data: PDF },
    });
    candidate = await ctx.sacraments.setRequirement.execute({
      actorId: IDS.coordinator,
      type: "FIRST_COMMUNION",
      catechumenId: enrollment.catechumenId,
      requirement: "RECONCILIATION",
      met: true,
    });
    expect(candidate.requirements[1]).toMatchObject({ met: true, source: "DOCUMENT" });
    expect(candidate.ready).toBe(true);
    expect(ctx.activity.entries.at(-1)).toMatchObject({
      category: "ENROLLMENT",
      summary: 'Primeira Comunhão de Ana Comunhão: marcou "Primeira Reconciliação"',
    });

    const pending = await ctx.sacraments.candidates.execute({
      type: "FIRST_COMMUNION",
      filter: "PENDING",
    });
    expect(pending.items).toEqual([]);
    expect(pending.counts).toEqual({ ALL: 1, READY: 1, PENDING: 0 });
  });

  it("não marca requisitos do percurso nem de quem não é candidato", async () => {
    const { enrollment } = await confirmedAt("COMMUNION_3", { fullName: "Ana Comunhão" });
    await expect(
      ctx.sacraments.setRequirement.execute({
        actorId: IDS.coordinator,
        type: "FIRST_COMMUNION",
        catechumenId: enrollment.catechumenId,
        requirement: "BAPTIZED",
        met: true,
      }),
    ).rejects.toThrow(InvalidSacramentError);
    await expect(
      ctx.sacraments.setRequirement.execute({
        actorId: IDS.coordinator,
        type: "CONFIRMATION",
        catechumenId: enrollment.catechumenId,
        requirement: "GODPARENT",
        met: true,
      }),
    ).rejects.toThrow(SacramentCandidateNotFoundError);
  });

  it("quem já é batizado não é candidato ao Batismo", async () => {
    await confirmedAt("BAPTISM_3", { fullName: "Beto Batizado", baptism: true });
    await confirmedAt("BAPTISM_3", { fullName: "Carla Catecúmena", baptism: false }, "B", IDS.both);
    const { items } = await ctx.sacraments.candidates.execute({ type: "BAPTISM" });
    expect(items.map((item) => item.fullName)).toEqual(["Carla Catecúmena"]);
    expect(items[0].requirements.map((item) => item.requirement)).toEqual([
      "BIRTH_CERTIFICATE",
      "GODPARENT",
      "PARENTS_MEETING",
    ]);
  });
});

describe("Relatórios", () => {
  it("indicadores do ano; os pagamentos só com o financeiro", async () => {
    const { enrollment } = await confirmedAt("COMMUNION_3", { fullName: "Ana Comunhão" });
    await ctx.saveRoll.execute({
      accountId: IDS.catechist,
      date: "2026-10-10",
      marks: [{ catechumenId: enrollment.catechumenId, status: "ABSENT" }],
    });
    ctx.ledger.items.push(
      {
        enrollmentId: enrollment.id,
        enrollmentCode: enrollment.code,
        catechumenName: "Ana Comunhão",
        purpose: "ENROLLMENT",
        amount: 5000,
        status: "PAID",
        method: "CASH",
        paidAt: "2026-10-12T10:00:00.000Z",
      },
      {
        enrollmentId: "outra-matricula",
        enrollmentCode: "CRP-2025-00001",
        catechumenName: "De outro ano",
        purpose: "ENROLLMENT",
        amount: 5000,
        status: "AWAITING_PAYMENT",
      },
    );

    const report = await ctx.reports.report.execute({ canSeeFinance: true });
    expect(report).toMatchObject({
      catecheticalYear: "2026/2027",
      stats: { catechumens: 1, confirmed: 1 },
      classes: { total: 1, averageOccupancy: 3 },
      levels: [{ level: "COMMUNION_3", count: 1 }],
      attendance: [{ date: "2026-10-10", present: 0, total: 1, rate: 0 }],
      attendanceRate: 0,
      results: { year: "2025/2026", stages: [] },
      payments: { received: 5000, paidCount: 1, underReview: 0, awaiting: 0, outstanding: 0 },
    });
    expect((await ctx.reports.report.execute({ canSeeFinance: false })).payments).toBeNull();
  });

  it("exporta as listas do ano (os pagamentos pedem o financeiro)", async () => {
    await confirmedAt("COMMUNION_3", { fullName: "Ana Comunhão" });
    const catechumens = await ctx.reports.export.execute({
      kind: "catechumens",
      canSeeFinance: false,
    });
    expect(catechumens.filename).toBe("catequizandos-2026-2027.csv");
    expect(catechumens.rows).toEqual([
      [
        "Ana Comunhão",
        "10/03/2015",
        "Comunhão · 3.º ano",
        "Turma A",
        "Anderson Francisco",
        expect.stringMatching(/^CRP-2026-/),
        "Confirmada",
      ],
    ]);
    const classes = await ctx.reports.export.execute({ kind: "classes", canSeeFinance: false });
    expect(classes.rows[0]).toEqual([
      "Comunhão · 3.º ano — Turma A",
      "Sábado de manhã · 08:00",
      "Sala 01",
      "Maria José (principal)",
      1,
      30,
    ]);
    await expect(
      ctx.reports.export.execute({ kind: "payments", canSeeFinance: false }),
    ).rejects.toThrow(ReportNotAllowedError);
  });

  it("o CSV escapa separadores e neutraliza fórmulas", () => {
    expect(
      toCsv(
        ["Nome", "Nota"],
        [
          ['=HYPERLINK("x")', -5],
          ["Ana; Maria", undefined],
        ],
      ),
    ).toBe('﻿Nome;Nota\r\n"\'=HYPERLINK(""x"")";-5\r\n"Ana; Maria";');
  });
});
