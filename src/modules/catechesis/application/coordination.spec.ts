import { beforeEach, describe, expect, it } from "vitest";

import {
  DeadlineClosedError,
  EnrollmentNotFoundError,
  InvalidCalendarError,
  InvalidSessionDateError,
  NotAnApprovedCatechistError,
} from "../domain/errors/catechesis.errors.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

/** Matrícula confirmada numa turma com a catequista Maria José. */
async function confirmedInClass() {
  const klass = await ctx.classWithCatechist();
  const enrollment = await ctx.enrollChild();
  await ctx.decide({
    actorId: IDS.coordinator,
    enrollmentId: enrollment.id,
    decision: "CONFIRMED",
    classId: klass.id,
  });
  return { klass, enrollment };
}

describe("Prazos das famílias", () => {
  it("fecha as matrículas fora do prazo (a coordenação com permissão passa)", async () => {
    await ctx.setDeadline.execute({
      actorId: IDS.coordinator,
      purpose: "ENROLLMENT",
      window: { startsOn: "2026-09-14", endsOn: "2026-10-12" },
    });
    // Hoje é 13 de outubro.
    await expect(ctx.enrollChild()).rejects.toThrow(DeadlineClosedError);
    await expect(ctx.enrollChild()).rejects.toThrow("terminaram a 12/10/2026");
    const late = await ctx.submit.execute({
      accountId: IDS.guardian,
      guardian: { relationship: "FATHER" },
      catechumen: {
        fullName: "Inês Francisco",
        birthDate: "2017-05-02",
        gender: "FEMALE",
        sacraments: { baptism: true, firstCommunion: false },
      },
      catechesis: { type: "NEW", level: "COMMUNION_1", preferredSlot: "SATURDAY_MORNING" },
      allowLate: true,
    });
    expect(late.status).toBe("SUBMITTED");

    const calendar = await ctx.setDeadline.execute({
      actorId: IDS.coordinator,
      purpose: "ENROLLMENT",
      window: null,
    });
    expect(calendar.windows).toEqual({});
    await expect(
      ctx.setDeadline.execute({
        actorId: IDS.coordinator,
        purpose: "CONFIRMATION",
        window: { startsOn: "2026-10-31", endsOn: "2026-10-01" },
      }),
    ).rejects.toThrow(InvalidCalendarError);
  });
});

describe("Turmas", () => {
  it("detalhe com encontros, presenças e pauta", async () => {
    const { klass, enrollment } = await confirmedInClass();
    await ctx.saveRoll.execute({
      accountId: IDS.catechist,
      date: "2026-10-10",
      marks: [{ catechumenId: enrollment.catechumenId, status: "PRESENT" }],
    });
    const detail = await ctx.classDetail.execute({ classId: klass.id });
    expect(detail.isCurrentYear).toBe(true);
    expect(detail.class).toMatchObject({ section: "A", members: 1 });
    expect(detail.sessions.slice(0, 3)).toEqual([
      { date: "2026-09-26", held: true },
      { date: "2026-10-03", held: true },
      { date: "2026-10-10", held: true },
    ]);
    expect(detail.sessions[3]).toEqual({ date: "2026-10-17", held: false });
    expect(detail.members[0]).toMatchObject({
      fullName: "Inês Francisco",
      attendance: { "2026-10-10": "PRESENT" },
      rate: 100,
    });

    await ctx.saveEvaluations.execute({
      accountId: IDS.catechist,
      rows: [{ catechumenId: enrollment.catechumenId, grades: { T1: 12 }, outcome: "PASSED" }],
    });
    const results = await ctx.results.execute({ classId: klass.id });
    expect(results.summary).toEqual({ passed: 1, repeat: 0, pending: 0 });
    expect(await ctx.years.execute()).toEqual([{ year: "2026/2027", active: true }]);
  });

  it("gera as turmas que faltam, coloca os aprovados e atribui catequistas", async () => {
    // Três aprovados de Comunhão 1.º ano à espera de turma.
    for (const [index, name] of ["Ana Silva", "Rui Costa", "Eva Lima"].entries()) {
      const enrollment = await ctx.enrollChild({
        fullName: name,
        birthDate: `2017-0${index + 1}-01`,
      });
      await ctx.act.execute({
        actorId: IDS.coordinator,
        enrollmentId: enrollment.id,
        action: { kind: "approve" },
      });
    }
    const plan = await ctx.generation.plan.execute({ level: "COMMUNION_1", capacity: 5 });
    expect(plan).toMatchObject({
      catechumens: 3,
      waiting: 3,
      sizes: [3],
      existing: 0,
      slot: "SATURDAY_MORNING",
    });
    // Maria José e Joana Kiala estão aprovadas e sem turma.
    expect(plan.availableCatechists).toBe(2);

    const result = await ctx.generation.generate.execute({
      actorId: IDS.coordinator,
      level: "COMMUNION_1",
      capacity: 5,
      slot: "SATURDAY_MORNING",
    });
    expect(result).toEqual({ created: 1, placed: 3, assigned: 1 });
    const [klass] = await ctx.listClasses.execute();
    expect(klass).toMatchObject({ section: "A", members: 3, catechists: [{ role: "LEAD" }] });
    expect(
      ctx.notifier.kinds().filter((kind) => kind === "catechesis.enrollment_confirmed"),
    ).toHaveLength(3);

    // Gerar de novo não duplica nem mexe nos colocados.
    expect(
      await ctx.generation.generate.execute({
        actorId: IDS.coordinator,
        level: "COMMUNION_1",
        capacity: 5,
        slot: "SATURDAY_MORNING",
      }),
    ).toEqual({ created: 0, placed: 0, assigned: 0 });
  });

  it("cria a turma e coloca uma transferência que ainda não foi aprovada", async () => {
    await ctx.submit.execute({
      accountId: IDS.guardian,
      guardian: { relationship: "MOTHER" },
      catechumen: {
        fullName: "Lia Transferência",
        birthDate: "2016-03-03",
        gender: "FEMALE",
        sacraments: { baptism: true, firstCommunion: false },
      },
      catechesis: {
        type: "TRANSFER",
        level: "COMMUNION_2",
        preferredSlot: "SATURDAY_MORNING",
        previousParish: "Paróquia de São Paulo",
      },
    });
    // Uma matrícula nova, ainda submetida, não conta.
    await ctx.enrollChild();
    const untouched = await ctx.generation.plan.execute({ level: "COMMUNION_1", capacity: 30 });
    expect(untouched.catechumens).toBe(0);

    const plan = await ctx.generation.plan.execute({ level: "COMMUNION_2", capacity: 30 });
    expect(plan).toMatchObject({ catechumens: 1, waiting: 1, existing: 0 });

    const result = await ctx.generation.generate.execute({
      actorId: IDS.coordinator,
      level: "COMMUNION_2",
      capacity: 30,
      slot: "SATURDAY_MORNING",
    });
    expect(result).toEqual({ created: 1, placed: 1, assigned: 1 });
    const classes = await ctx.listClasses.execute();
    expect(classes.find((item) => item.level === "COMMUNION_2")).toMatchObject({
      section: "A",
      members: 1,
    });
  });
});

describe("Catequistas", () => {
  it("estado automático pela turma, estado manual e perfil com o percurso", async () => {
    await confirmedInClass();
    const first = await ctx.catechists.list.execute({});
    let items = first.items;
    const counts = first.counts;
    expect(items.map((row) => `${row.fullName}:${row.status}`)).toEqual([
      "Joana Kiala:AVAILABLE",
      "Maria José:ACTIVE",
    ]);
    expect(counts).toMatchObject({ todos: 2, ativos: 1, disponiveis: 1 });

    await ctx.setCatechistStatus.execute({
      actorId: IDS.coordinator,
      accountId: IDS.both,
      status: "IN_TRAINING",
    });
    items = (await ctx.catechists.list.execute({ tab: "em-formacao" })).items;
    expect(items.map((row) => row.fullName)).toEqual(["Joana Kiala"]);
    await expect(
      ctx.setCatechistStatus.execute({
        actorId: IDS.coordinator,
        accountId: IDS.pending,
        status: null,
      }),
    ).rejects.toThrow(NotAnApprovedCatechistError);

    const profile = await ctx.catechists.profile.execute({ accountId: IDS.catechist });
    expect(profile).toMatchObject({
      status: "ACTIVE",
      totalCatechumens: 1,
      currentClass: { section: "A", role: "LEAD", enrolled: 1 },
      timeline: [{ catecheticalYear: "2026/2027", isCurrent: true }],
    });
  });
});

describe("Presenças vistas pela coordenação", () => {
  it("dias de encontro, chamada de cada turma e presença do catequista", async () => {
    const { klass, enrollment } = await confirmedInClass();
    const days = await ctx.sessionDays.execute();
    expect(days[0]).toEqual({ date: "2026-10-11", slots: ["SUNDAY_AFTER_MASS"] });
    expect(days[1]).toEqual({
      date: "2026-10-10",
      slots: ["SATURDAY_MORNING", "SATURDAY_AFTERNOON"],
    });

    await ctx.saveRoll.execute({
      accountId: IDS.catechist,
      date: "2026-10-10",
      marks: [{ catechumenId: enrollment.catechumenId, status: "ABSENT" }],
    });
    await ctx.setPresence.execute({
      actorId: IDS.coordinator,
      classId: klass.id,
      date: "2026-10-10",
      status: "PRESENT",
    });
    const [row] = await ctx.session.execute({ date: "2026-10-10" });
    expect(row).toMatchObject({
      catechistPresence: "PRESENT",
      rollMarked: true,
      present: 0,
      total: 1,
    });
    expect(await ctx.session.execute({ date: "2026-10-11" })).toEqual([]);
    await expect(
      ctx.setPresence.execute({
        actorId: IDS.coordinator,
        classId: klass.id,
        date: "2026-10-17",
        status: "PRESENT",
      }),
    ).rejects.toThrow(InvalidSessionDateError);
  });
});

describe("Catequizandos, resumo e acompanhamento público", () => {
  it("lista e ficha com o percurso", async () => {
    const { enrollment } = await confirmedInClass();
    await ctx.enrollChild({ fullName: "Rui Francisco", birthDate: "2016-01-01" });
    const page = await ctx.listCatechumens.execute({ page: 1, pageSize: 20, search: "ines" });
    expect(page.items).toEqual([
      expect.objectContaining({
        fullName: "Inês Francisco",
        stage: "COMMUNION",
        classLabel: "Turma A",
        guardianName: "Anderson Francisco",
      }),
    ]);
    const file = await ctx.catechumenFile.execute({ catechumenId: enrollment.catechumenId });
    expect(file).toMatchObject({
      guardian: { fullName: "Anderson Francisco", relationship: "FATHER" },
      journey: [
        {
          catecheticalYear: "2026/2027",
          classSection: "A",
          catechistName: "Maria José",
          isCurrent: true,
        },
      ],
    });
  });

  it("resumo do ano", async () => {
    await confirmedInClass();
    ctx.clock.advance(60_000);
    await ctx.enrollChild({ fullName: "Rui Francisco", birthDate: "2016-01-01" });
    const overview = await ctx.overview.execute();
    expect(overview.stats).toMatchObject({
      catechumens: 2,
      confirmed: 1,
      underReview: 1,
      catechists: 2,
      activeCatechists: 1,
    });
    expect(overview.attention).toMatchObject({ review: 1, pendingCatechists: 1 });
    expect(overview.trend.at(-1)).toMatchObject({ total: 2 });
    expect(overview.activity[0]).toMatchObject({
      subject: "Rui Francisco",
      kind: "NEW_ENROLLMENT",
    });
    expect(overview.classes).toEqual({ total: 1, averageOccupancy: 3 });
  });

  it("acompanhamento pelo número sem o nome completo", async () => {
    const { enrollment } = await confirmedInClass();
    const view = await ctx.track.execute({ code: ` ${enrollment.code.toLowerCase()} ` });
    expect(view).toMatchObject({
      code: enrollment.code,
      status: "CONFIRMED",
      catechumenName: "Inês F.",
      classInfo: { section: "A", room: "Sala 04", catechist: "Maria José" },
    });
    expect(JSON.stringify(view)).not.toContain("Francisco");
    await expect(ctx.track.execute({ code: "CRP-2026-00000" })).rejects.toThrow(
      EnrollmentNotFoundError,
    );
    await expect(ctx.track.execute({ code: "x" })).rejects.toThrow(/inválido/);
  });
});
