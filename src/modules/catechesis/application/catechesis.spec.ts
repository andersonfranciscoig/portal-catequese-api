import { beforeEach, describe, expect, it } from "vitest";

import { CatecheticalCalendar } from "../domain/catechetical-calendar.js";
import {
  CalendarNotDefinedError,
  CatechumenNotFoundError,
  ClassAlreadyExistsError,
  ClassFullError,
  EnrollmentAlreadyDecidedError,
  EnrollmentAlreadyExistsError,
  InvalidCalendarError,
  InvalidClassError,
  InvalidEnrollmentError,
  InvalidEvaluationError,
  InvalidSessionDateError,
  NoClassAssignedError,
  NotAClassMemberError,
  NotAnApplicantError,
  NotAnApprovedCatechistError,
} from "../domain/errors/catechesis.errors.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(() => {
  ctx = createCatechesisTestContext();
});

describe("Ano catequético", () => {
  it("calcula os encontros semanais de cada período", () => {
    const calendar = CatecheticalCalendar.define(
      { label: "2026/2027", startsOn: "2026-09-26", endsOn: "2027-07-03" },
      new Date(),
    );
    expect(calendar.sessionDates("SATURDAY_MORNING", "2026-10-13")).toEqual([
      "2026-09-26",
      "2026-10-03",
      "2026-10-10",
    ]);
    expect(calendar.sessionDates("SUNDAY_AFTER_MASS", "2026-10-05")).toEqual([
      "2026-09-27",
      "2026-10-04",
    ]);
    expect(calendar.nextSession("SATURDAY_MORNING", "2026-10-13")).toBe("2026-10-17");
    expect(calendar.nextSession("SATURDAY_MORNING", "2027-07-04")).toBeUndefined();
    expect(calendar.isSessionDate("SATURDAY_MORNING", "2026-10-11")).toBe(false);
  });

  it("recusa anos e datas inválidos", async () => {
    await expect(
      ctx.setCalendar.execute({
        actorId: IDS.coordinator,
        label: "2026/2028",
        startsOn: "2026-09-26",
        endsOn: "2027-07-03",
      }),
    ).rejects.toThrow(InvalidCalendarError);
    await expect(
      ctx.setCalendar.execute({
        actorId: IDS.coordinator,
        label: "2026/2027",
        startsOn: "2027-07-03",
        endsOn: "2026-09-26",
      }),
    ).rejects.toThrow(InvalidCalendarError);
  });

  it("sem ano definido, não há matrículas", async () => {
    await expect(ctx.enrollChild()).rejects.toThrow(CalendarNotDefinedError);
    await expect(ctx.getCalendar.execute()).rejects.toThrow(CalendarNotDefinedError);
  });
});

describe("Matrículas no portal da família", () => {
  beforeEach(() => ctx.defineYear());

  it("o encarregado inscreve um educando e vê-o no portal", async () => {
    const receipt = await ctx.enrollChild();
    expect(receipt).toMatchObject({
      code: "CRP-2026-48200",
      status: "SUBMITTED",
      catechumenName: "Inês Francisco",
      catecheticalYear: "2026/2027",
    });
    expect(ctx.activity.actions()).toContain("catechesis.enrollment_submitted");

    const family = await ctx.family.execute({ accountId: IDS.guardian });
    expect(family.children).toHaveLength(1);
    expect(family.children[0]).toMatchObject({
      fullName: "Inês Francisco",
      enrollment: { status: "SUBMITTED" },
    });
    expect(family.children[0].classInfo).toBeUndefined();
    expect(family.enrollments.map((item) => item.code)).toEqual(["CRP-2026-48200"]);
  });

  it("não aceita duas matrículas do mesmo educando no mesmo ano (reaproveita o catequizando)", async () => {
    await ctx.enrollChild();
    await expect(ctx.enrollChild({ fullName: "  inês   francisco " })).rejects.toThrow(
      EnrollmentAlreadyExistsError,
    );
    expect(ctx.catechumens.items.size).toBe(1);
  });

  it("respeita a idade: menores pelo encarregado, adultos por si", async () => {
    await expect(ctx.enrollChild({ birthDate: "2000-01-01" })).rejects.toThrow(
      InvalidEnrollmentError,
    );
    const adult = {
      accountId: IDS.adult,
      catechumen: {
        fullName: "Carlos Mendes",
        birthDate: "1995-03-10",
        gender: "MALE" as const,
        sacraments: { baptism: true, firstCommunion: true },
      },
      catechesis: {
        type: "NEW" as const,
        level: "CONFIRMATION_1" as const,
        preferredSlot: "SATURDAY_AFTERNOON" as const,
      },
    };
    expect(await ctx.submit.execute(adult)).toMatchObject({ status: "SUBMITTED" });
    await expect(
      ctx.submit.execute({
        ...adult,
        catechumen: { ...adult.catechumen, birthDate: "2012-01-01" },
      }),
    ).rejects.toThrow(InvalidEnrollmentError);

    const own = await ctx.family.execute({ accountId: IDS.adult });
    const profile = await ctx.profile.execute({
      accountId: IDS.adult,
      catechumenId: own.children[0].id,
    });
    expect(profile.self).toBe(true);
  });

  it("só encarregados e adultos fazem matrículas, cada um no seu papel", async () => {
    await expect(ctx.enrollChild({}, IDS.catechist)).rejects.toThrow(NotAnApplicantError);
    // O encarregado não se inscreve a si próprio como adulto.
    await expect(
      ctx.submit.execute({
        accountId: IDS.guardian,
        catechumen: {
          fullName: "Anderson Francisco",
          birthDate: "1985-01-01",
          gender: "MALE",
          sacraments: { baptism: true, firstCommunion: true },
        },
        catechesis: { type: "NEW", level: "CONFIRMATION_1", preferredSlot: "SATURDAY_AFTERNOON" },
      }),
    ).rejects.toThrow(NotAnApplicantError);
  });

  it("transferência exige a paróquia de origem", async () => {
    await expect(
      ctx.submit.execute({
        accountId: IDS.guardian,
        guardian: { relationship: "MOTHER" },
        catechumen: {
          fullName: "Rui Francisco",
          birthDate: "2015-02-02",
          gender: "MALE",
          sacraments: { baptism: true, firstCommunion: false },
        },
        catechesis: { type: "TRANSFER", level: "COMMUNION_2", preferredSlot: "SATURDAY_MORNING" },
      }),
    ).rejects.toThrow(InvalidEnrollmentError);
  });

  it("outra família não vê o perfil do educando", async () => {
    await ctx.enrollChild();
    const [child] = (await ctx.family.execute({ accountId: IDS.guardian })).children;
    await expect(
      ctx.profile.execute({ accountId: IDS.stranger, catechumenId: child.id }),
    ).rejects.toThrow(CatechumenNotFoundError);
  });
});

describe("Coordenação: turmas e confirmação", () => {
  beforeEach(() => ctx.defineYear());

  it("cria turmas sem repetir nível e letra", async () => {
    await ctx.classWithCatechist();
    await expect(
      ctx.createClass.execute({
        actorId: IDS.coordinator,
        level: "COMMUNION_1",
        section: "a",
        slot: "SATURDAY_MORNING",
        room: "Sala 05",
        capacity: 20,
      }),
    ).rejects.toThrow(ClassAlreadyExistsError);
    const [listed] = await ctx.listClasses.execute();
    expect(listed).toMatchObject({
      section: "A",
      members: 0,
      catechists: [{ fullName: "Maria José", role: "LEAD" }],
      nextSessionDate: "2026-10-17",
    });
  });

  it("só atribui catequistas aprovados e sem outra turma no ano", async () => {
    const klass = await ctx.classWithCatechist();
    await expect(
      ctx.assign.execute({
        actorId: IDS.coordinator,
        classId: klass.id,
        catechists: [{ accountId: IDS.pending, role: "LEAD" }],
      }),
    ).rejects.toThrow(InvalidClassError);
    const other = await ctx.createClass.execute({
      actorId: IDS.coordinator,
      level: "COMMUNION_2",
      section: "A",
      slot: "SATURDAY_MORNING",
      room: "Sala 06",
      capacity: 20,
    });
    await expect(
      ctx.assign.execute({
        actorId: IDS.coordinator,
        classId: other.id,
        catechists: [{ accountId: IDS.catechist, role: "LEAD" }],
      }),
    ).rejects.toThrow(/já tem outra turma/);
    await expect(
      ctx.assign.execute({
        actorId: IDS.coordinator,
        classId: other.id,
        catechists: [
          { accountId: IDS.both, role: "LEAD" },
          { accountId: IDS.both, role: "ASSISTANT" },
        ],
      }),
    ).rejects.toThrow(InvalidClassError);
  });

  it("confirma numa turma do mesmo nível, com lugar, e a família vê a turma", async () => {
    const enrollment = await ctx.enrollChild();
    const klass = await ctx.classWithCatechist();
    const wrong = await ctx.createClass.execute({
      actorId: IDS.coordinator,
      level: "BIBLICAL",
      section: "A",
      slot: "SATURDAY_AFTERNOON",
      room: "Sala 10",
      capacity: 20,
    });
    await expect(
      ctx.decide({
        actorId: IDS.coordinator,
        enrollmentId: enrollment.id,
        decision: "CONFIRMED",
        classId: wrong.id,
      }),
    ).rejects.toThrow(InvalidEnrollmentError);

    const confirmed = await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    expect(confirmed).toMatchObject({ status: "CONFIRMED", classId: klass.id });
    await expect(
      ctx.decide({
        actorId: IDS.coordinator,
        enrollmentId: enrollment.id,
        decision: "REJECTED",
      }),
    ).rejects.toThrow(EnrollmentAlreadyDecidedError);

    const [card] = (await ctx.family.execute({ accountId: IDS.guardian })).children;
    expect(card.classInfo).toMatchObject({
      section: "A",
      room: "Sala 04",
      catechists: [{ fullName: "Maria José" }],
      nextSessionDate: "2026-10-17",
    });
    expect(
      (
        await ctx.listEnrollments.execute({
          tab: "confirmadas",
          sort: "recentes",
          page: 1,
          pageSize: 20,
        })
      ).items,
    ).toHaveLength(1);
  });

  it("não passa da lotação da turma", async () => {
    const klass = await ctx.classWithCatechist(IDS.catechist, 1);
    const first = await ctx.enrollChild();
    const second = await ctx.enrollChild({ fullName: "Rui Francisco", birthDate: "2016-01-01" });
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: first.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    await expect(
      ctx.decide({
        actorId: IDS.coordinator,
        enrollmentId: second.id,
        decision: "CONFIRMED",
        classId: klass.id,
      }),
    ).rejects.toThrow(ClassFullError);
  });
});

describe("Portal do catequista", () => {
  /** Turma com dois catequizandos confirmados. */
  async function classWithMembers(catechistId = IDS.catechist) {
    await ctx.defineYear();
    const klass = await ctx.classWithCatechist(catechistId);
    const ids: string[] = [];
    for (const child of [
      { fullName: "Inês Francisco", birthDate: "2017-05-02" },
      { fullName: "Rui Francisco", birthDate: "2016-01-01" },
    ]) {
      const enrollment = await ctx.enrollChild(child);
      await ctx.decide({
        actorId: IDS.coordinator,
        enrollmentId: enrollment.id,
        decision: "CONFIRMED",
        classId: klass.id,
      });
      ids.push(enrollment.catechumenId);
    }
    return { klass, ids };
  }

  it("só para catequistas aprovados", async () => {
    await ctx.defineYear();
    await expect(ctx.myClass.execute({ accountId: IDS.pending })).rejects.toThrow(
      NotAnApprovedCatechistError,
    );
    await expect(ctx.myClass.execute({ accountId: IDS.guardian })).rejects.toThrow(
      NotAnApprovedCatechistError,
    );
    expect(await ctx.myClass.execute({ accountId: IDS.catechist })).toMatchObject({ class: null });
    await expect(
      ctx.roll.execute({ accountId: IDS.catechist, date: "2026-10-10" }),
    ).rejects.toThrow(NoClassAssignedError);
  });

  it("mostra a turma, os catequizandos e os encontros já realizados", async () => {
    await classWithMembers();
    const view = await ctx.myClass.execute({ accountId: IDS.catechist });
    expect(view.class).toMatchObject({ section: "A" });
    expect(view.members.map((item) => item.fullName)).toEqual(["Inês Francisco", "Rui Francisco"]);
    expect(view.sessions.map((item) => item.date)).toEqual([
      "2026-10-10",
      "2026-10-03",
      "2026-09-26",
    ]);
    expect(view.sessions[0]).toMatchObject({ marked: false, total: 2 });
    expect(view.nextSessionDate).toBe("2026-10-17");
  });

  it("lança a chamada só em dias de encontro já passados e com todos", async () => {
    const { ids } = await classWithMembers();
    const roll = { accountId: IDS.catechist };
    await expect(ctx.roll.execute({ ...roll, date: "2026-10-11" })).rejects.toThrow(
      InvalidSessionDateError,
    );
    await expect(ctx.roll.execute({ ...roll, date: "2026-10-17" })).rejects.toThrow(
      InvalidSessionDateError,
    );
    await expect(
      ctx.saveRoll.execute({
        ...roll,
        date: "2026-10-10",
        marks: [{ catechumenId: ids[0], status: "PRESENT" }],
      }),
    ).rejects.toThrow(NotAClassMemberError);

    const saved = await ctx.saveRoll.execute({
      ...roll,
      date: "2026-10-10",
      marks: [
        { catechumenId: ids[0], status: "PRESENT" },
        { catechumenId: ids[1], status: "ABSENT" },
      ],
    });
    expect(saved.members.map((item) => item.status)).toEqual(["PRESENT", "ABSENT"]);
    const [last] = (await ctx.myClass.execute(roll)).sessions;
    expect(last).toMatchObject({ date: "2026-10-10", marked: true, present: 1, total: 2 });
    expect(ctx.activity.actions()).toContain("catechesis.attendance_saved");

    // A família vê a presença no perfil.
    const profile = await ctx.profile.execute({ accountId: IDS.guardian, catechumenId: ids[0] });
    expect(profile.attendance).toMatchObject({ total: 1, present: 1, rate: 100 });
  });

  it("avalia com notas de 0 a 20 e sugere a decisão final", async () => {
    const { ids } = await classWithMembers();
    const accountId = IDS.catechist;
    await expect(
      ctx.saveEvaluations.execute({
        accountId,
        rows: [{ catechumenId: ids[0], grades: { T1: 21 } }],
      }),
    ).rejects.toThrow(InvalidEvaluationError);
    await ctx.saveRoll.execute({
      accountId,
      date: "2026-10-10",
      marks: [
        { catechumenId: ids[0], status: "PRESENT" },
        { catechumenId: ids[1], status: "PRESENT" },
      ],
    });
    const rows = await ctx.saveEvaluations.execute({
      accountId,
      rows: [
        { catechumenId: ids[0], grades: { T1: 14, T2: 15.5 } },
        { catechumenId: ids[1], grades: { T1: 8 }, outcome: "REPEAT" },
      ],
    });
    expect(rows[0]).toMatchObject({ average: 14.8, attendanceRate: 100, suggested: "PASSED" });
    expect(rows[1]).toMatchObject({ average: 8, suggested: "REPEAT", outcome: "REPEAT" });

    const file = await ctx.file.execute({ accountId, catechumenId: ids[0] });
    expect(file).toMatchObject({
      fullName: "Inês Francisco",
      attendance: [{ date: "2026-10-10", status: "PRESENT" }],
      guardian: { fullName: "Anderson Francisco", relationship: "FATHER", phone: "+244923482117" },
    });
    await expect(ctx.file.execute({ accountId, catechumenId: IDS.stranger })).rejects.toThrow(
      CatechumenNotFoundError,
    );
  });

  it("quem é catequista e encarregado usa os dois portais", async () => {
    await classWithMembers(IDS.both);
    const own = await ctx.enrollChild({ fullName: "Ana Kiala", birthDate: "2018-03-03" }, IDS.both);
    expect(own.status).toBe("SUBMITTED");
    expect((await ctx.family.execute({ accountId: IDS.both })).children).toHaveLength(1);
    expect((await ctx.myClass.execute({ accountId: IDS.both })).members).toHaveLength(2);
  });
});

describe("Notificações da catequese", () => {
  beforeEach(() => ctx.defineYear());

  it("a matrícula avisa a coordenação e a decisão avisa a família", async () => {
    const enrollment = await ctx.enrollChild();
    expect(ctx.notifier.last("catechesis.enrollment_submitted")).toMatchObject({
      to: { permission: "COORDINATION" },
      body: "Inês Francisco · Comunhão · 1.º ano (CRP-2026-48200)",
      exceptAccountId: IDS.guardian,
    });

    const klass = await ctx.classWithCatechist();
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    expect(ctx.notifier.last("catechesis.enrollment_confirmed")).toMatchObject({
      to: { accountIds: [IDS.guardian] },
      title: "Matrícula de Inês confirmada",
      body: "Comunhão · 1.º ano — Turma A · Sábado de manhã · 08:00 · Sala 04",
      link: `/portal/educandos/${enrollment.catechumenId}`,
    });

    const other = await ctx.enrollChild({ fullName: "Rui Francisco", birthDate: "2016-01-01" });
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: other.id,
      decision: "REJECTED",
    });
    expect(ctx.notifier.last("catechesis.enrollment_rejected")).toMatchObject({
      title: "Matrícula de Rui não foi aceite",
      link: "/portal/matriculas",
    });
  });

  it("o adulto é avisado no seu portal", async () => {
    const enrollment = await ctx.submit.execute({
      accountId: IDS.adult,
      catechumen: {
        fullName: "Carlos Mendes",
        birthDate: "1995-03-10",
        gender: "MALE",
        sacraments: { baptism: true, firstCommunion: true },
      },
      catechesis: { type: "NEW", level: "CONFIRMATION_1", preferredSlot: "SATURDAY_AFTERNOON" },
    });
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "REJECTED",
    });
    const sent = ctx.notifier.messages.filter(
      (item) => item.kind === "catechesis.enrollment_rejected",
    );
    expect(sent).toEqual([expect.objectContaining({ to: { accountIds: [IDS.adult] } })]);
  });

  it("o catequista é avisado quando recebe ou deixa uma turma", async () => {
    const klass = await ctx.classWithCatechist();
    expect(ctx.notifier.last("catechesis.class_assigned")).toMatchObject({
      to: { accountIds: [IDS.catechist] },
      body: "Comunhão · 1.º ano — Turma A · Sábado de manhã · 08:00 · Sala 04",
    });
    await ctx.assign.execute({
      actorId: IDS.coordinator,
      classId: klass.id,
      catechists: [{ accountId: IDS.both, role: "LEAD" }],
    });
    expect(ctx.notifier.last("catechesis.class_assigned")?.to).toEqual({ accountIds: [IDS.both] });
    expect(ctx.notifier.last("catechesis.class_unassigned")).toMatchObject({
      to: { accountIds: [IDS.catechist] },
      title: "Deixou de acompanhar Comunhão · 1.º ano — Turma A",
    });
  });

  it("a falta avisa o encarregado uma só vez", async () => {
    const klass = await ctx.classWithCatechist();
    const enrollment = await ctx.enrollChild();
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    const roll = (status: "PRESENT" | "ABSENT") =>
      ctx.saveRoll.execute({
        accountId: IDS.catechist,
        date: "2026-10-10",
        marks: [{ catechumenId: enrollment.catechumenId, status }],
      });
    await roll("PRESENT");
    expect(ctx.notifier.kinds()).not.toContain("catechesis.absence");
    await roll("ABSENT");
    await roll("ABSENT");
    const absences = ctx.notifier.messages.filter((item) => item.kind === "catechesis.absence");
    expect(absences).toEqual([
      expect.objectContaining({
        to: { accountIds: [IDS.guardian] },
        title: "Inês faltou ao encontro de 10/10",
      }),
    ]);
  });
});
