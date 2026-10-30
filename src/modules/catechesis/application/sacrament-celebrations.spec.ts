import { beforeEach, describe, expect, it } from "vitest";

import type { CatechesisLevel } from "../domain/catechesis.js";
import {
  CelebrationNotFoundError,
  InvalidCelebrationError,
  ParticipantConflictError,
} from "../domain/errors/catechesis.errors.js";
import { distributeGroups, sacramentAptitude } from "../domain/sacraments.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

interface Person {
  name: string;
  /** Média (sem nota: nenhuma lançada). */
  grade?: number;
  /** Presente no único encontro com chamada (por omissão, sim). */
  present?: boolean;
  /** Requisitos da Comunhão cumpridos (por omissão, sim). */
  ready?: boolean;
}

/** Turma com catequizandos confirmados, notas, uma chamada e os requisitos da Comunhão. */
async function classWith(level: CatechesisLevel, section: string, people: Person[]) {
  const klass = await ctx.createClass.execute({
    actorId: IDS.coordinator,
    level,
    section,
    slot: "SATURDAY_MORNING",
    startTime: "08:00",
    room: `Sala ${section}`,
    capacity: 30,
  });
  const ids: Record<string, string> = {};
  for (const person of people) {
    const enrollment = await ctx.submit.execute({
      accountId: IDS.guardian,
      guardian: { relationship: "FATHER" },
      catechumen: {
        fullName: person.name,
        birthDate: "2015-03-10",
        gender: "FEMALE",
        sacraments: { baptism: true, firstCommunion: false },
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
    ids[person.name] = enrollment.catechumenId;
    if (person.grade !== undefined) {
      await ctx.evaluations.saveMany([
        {
          classId: klass.id,
          catechumenId: enrollment.catechumenId,
          grades: { T1: person.grade },
          updatedBy: IDS.catechist,
          updatedAt: ctx.clock.now(),
        },
      ]);
    }
    if (person.ready ?? true) {
      for (const requirement of ["BAPTISM_CERTIFICATE", "RECONCILIATION"] as const) {
        await ctx.sacramentRepository.saveCheck({
          catechumenId: enrollment.catechumenId,
          sacrament: "FIRST_COMMUNION",
          requirement,
          met: true,
          updatedAt: ctx.clock.now(),
          updatedBy: IDS.coordinator,
        });
      }
    }
  }
  await ctx.attendance.save({
    classId: klass.id,
    date: "2026-10-10",
    marks: people.map((person) => ({
      catechumenId: ids[person.name],
      status: person.present === false ? "ABSENT" : "PRESENT",
    })),
    recordedBy: IDS.catechist,
    recordedAt: ctx.clock.now(),
  });
  return { klass, ids };
}

const NONE = { classIds: [], catechumenIds: [] };

const create = (
  input: Partial<Parameters<typeof ctx.sacraments.create.execute>[0]> & { date: string },
) =>
  ctx.sacraments.create.execute({
    actorId: IDS.coordinator,
    type: "FIRST_COMMUNION",
    place: "Igreja Cristo Rei da Paz",
    selection: NONE,
    ...input,
  });

describe("Celebrações dos sacramentos", () => {
  it("cria, altera e apaga; o resumo mostra quem já tem celebração", async () => {
    const { ids } = await classWith("COMMUNION_3", "A", [
      { name: "Ana Apta", grade: 14.5 },
      { name: "Beto Baixo", grade: 8 },
    ]);
    const created = await create({
      date: "2027-05-30",
      time: "10:00",
      place: "  Igreja Cristo Rei da Paz ",
      notes: "  Ensaio na sexta-feira.  ",
    });
    expect(created).toMatchObject({
      type: "FIRST_COMMUNION",
      date: "2027-05-30",
      time: "10:00",
      place: "Igreja Cristo Rei da Paz",
      notes: "Ensaio na sexta-feira.",
      mode: "AUTO",
      selection: NONE,
      participants: 1,
      ready: 1,
    });
    expect(ctx.activity.entries.at(-1)).toMatchObject({
      category: "SETTINGS",
      action: "catechesis.sacrament_celebration_created",
      summary: "Marcou a celebração da Primeira Comunhão de 30/05/2027 (Igreja Cristo Rei da Paz)",
    });

    const overview = await ctx.sacraments.overview.execute();
    expect(overview.celebrations.map((item) => item.id)).toEqual([created.id]);
    expect(overview.types[1]).toMatchObject({ candidates: 2, assigned: 1, unassigned: 1 });

    // Pode haver outra no mesmo ano, até 3 meses depois do fim da catequese.
    const later = await create({ date: "2027-09-01", place: "Sé Catedral" });
    const updated = await ctx.sacraments.update.execute({
      actorId: IDS.coordinator,
      id: later.id,
      date: "2027-06-06",
      time: null,
      place: "Sé Catedral",
      notes: null,
      selection: { classIds: [], catechumenIds: [ids["Beto Baixo"]] },
    });
    expect(updated).toMatchObject({ mode: "MANUAL", time: null, notes: null, participants: 1 });
    expect((await ctx.sacraments.overview.execute()).celebrations.map((c) => c.date)).toEqual([
      "2027-05-30",
      "2027-06-06",
    ]);

    await ctx.sacraments.remove.execute({ actorId: IDS.coordinator, id: later.id });
    expect(ctx.activity.entries.at(-1)?.action).toBe("catechesis.sacrament_celebration_deleted");
    await expect(ctx.sacraments.participants.execute({ id: later.id })).rejects.toBeInstanceOf(
      CelebrationNotFoundError,
    );
    await expect(
      ctx.sacraments.remove.execute({ actorId: IDS.coordinator, id: later.id }),
    ).rejects.toBeInstanceOf(CelebrationNotFoundError);
  });

  it("valida a data, a hora, o local e a seleção", async () => {
    await expect(create({ date: "2027-10-04" })).rejects.toThrow(InvalidCelebrationError);
    await expect(create({ date: "2026-09-01" })).rejects.toThrow(InvalidCelebrationError);
    await expect(create({ date: "2027-05-30", time: "25:00" })).rejects.toThrow(
      InvalidCelebrationError,
    );
    await expect(create({ date: "2027-05-30", place: " ab " })).rejects.toThrow(
      InvalidCelebrationError,
    );
    await expect(
      create({
        date: "2027-05-30",
        selection: { classIds: ["00000000-0000-4000-8000-0000000000aa"], catechumenIds: [] },
      }),
    ).rejects.toThrow("turmas");
    await expect(
      create({
        date: "2027-05-30",
        selection: { classIds: [], catechumenIds: ["00000000-0000-4000-8000-0000000000bb"] },
      }),
    ).rejects.toThrow("catequizandos");
  });

  it("recusa um catequizando em duas celebrações do mesmo sacramento (409)", async () => {
    const { klass, ids } = await classWith("COMMUNION_3", "A", [
      { name: "Ana Apta", grade: 14 },
      { name: "Carla Costa", grade: 12 },
    ]);
    const first = await create({
      date: "2027-05-30",
      selection: { classIds: [klass.id], catechumenIds: [] },
    });
    const error = await create({
      date: "2027-06-06",
      selection: { classIds: [], catechumenIds: [ids["Carla Costa"]] },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParticipantConflictError);
    expect(error).toMatchObject({
      kind: "conflict",
      code: "sacraments.participant_conflict",
      details: {
        conflicts: [
          {
            catechumenId: ids["Carla Costa"],
            fullName: "Carla Costa",
            celebrationId: first.id,
            date: "2027-05-30",
          },
        ],
      },
    });
    // Gravar a mesma celebração outra vez não entra em conflito consigo própria.
    await expect(
      ctx.sacraments.update.execute({
        actorId: IDS.coordinator,
        id: first.id,
        date: "2027-05-30",
        place: "Igreja Cristo Rei da Paz",
        selection: { classIds: [klass.id], catechumenIds: [ids["Ana Apta"]] },
      }),
    ).resolves.toMatchObject({ participants: 2 });

    // Uma automática nunca entra em conflito: fica sem os que já estão numa manual.
    const auto = await create({ date: "2027-06-13" });
    expect(auto.participants).toBe(0);
  });

  it("modo automático: reparte turmas inteiras pelas datas, sempre da mesma forma", async () => {
    // "Aluno A1": turma A, primeiro da lista.
    const { ids: a } = await classWith("COMMUNION_3", "A", [
      { name: "Aluno A1", grade: 15 },
      { name: "Aluno A2", grade: 14 },
      { name: "Aluno A3", grade: 13 },
    ]);
    const { ids: b } = await classWith("COMMUNION_3", "B", [
      { name: "Aluno B1", grade: 19 },
      { name: "Aluno B2", grade: 11 },
      { name: "Aluno B3", grade: 9 },
    ]);
    await classWith("COMMUNION_3", "C", [{ name: "Aluno C1", grade: 16 }]);
    // Criada primeiro, mas mais tarde no calendário.
    const second = await create({ date: "2027-06-06" });
    const first = await create({ date: "2027-05-30" });

    const names = async (id: string) =>
      (await ctx.sacraments.participants.execute({ id })).items.map((item) =>
        item.fullName.replace("Aluno ", ""),
      );
    // A turma maior (A: 3 aptos) vai para a primeira data; B (2) e C (1) para a outra.
    expect(await names(first.id)).toEqual(["A1", "A2", "A3"]);
    expect(await names(second.id)).toEqual(["B1", "C1", "B2"]);
    expect(await names(first.id)).toEqual(["A1", "A2", "A3"]);
    const [top] = (await ctx.sacraments.participants.execute({ id: second.id })).items;
    expect(top).toMatchObject({ source: "SUGGESTED", classLabel: "Comunhão · 3.º ano · B" });

    // Quem está numa celebração manual sai das sugestões.
    const manual = await create({
      date: "2027-06-13",
      selection: { classIds: [], catechumenIds: [a["Aluno A1"], b["Aluno B3"]] },
    });
    expect(manual).toMatchObject({ mode: "MANUAL", participants: 2 });
    expect(await names(first.id)).toEqual(["C1", "A2", "A3"]);
    expect(await names(second.id)).toEqual(["B1", "B2"]);
    const overview = await ctx.sacraments.overview.execute();
    expect(overview.types[1]).toMatchObject({ candidates: 7, assigned: 7, unassigned: 0 });
  });

  it("avalia cada um: média, presença e requisitos, com os motivos", async () => {
    const { klass, ids } = await classWith("COMMUNION_3", "A", [
      { name: "Ana Apta", grade: 14.5 },
      { name: "Beto Baixo", grade: 8, ready: false },
      { name: "Carla Sem Notas" },
      { name: "Dário Faltoso", grade: 15, present: false },
    ]);
    const { items } = await ctx.sacraments.members.execute({
      classId: klass.id,
      type: "FIRST_COMMUNION",
    });
    const byName = Object.fromEntries(items.map((item) => [item.fullName, item]));
    expect(byName["Ana Apta"]).toMatchObject({
      catechumenId: ids["Ana Apta"],
      classId: klass.id,
      classLabel: "Comunhão · 3.º ano · A",
      average: 14.5,
      attendanceRate: 100,
      eligible: true,
      reasons: ["Média 14,5", "Presença 100%"],
      source: "INDIVIDUAL",
    });
    expect(items.map((item) => item.fullName)).toEqual(["Ana Apta"]);
    expect(
      sacramentAptitude({
        average: 8,
        attendanceRate: 100,
        missing: ["Certidão de batismo", "Primeira Reconciliação"],
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        "Média 8,0 (abaixo de 10)",
        "Presença 100%",
        "Falta: Certidão de batismo, Primeira Reconciliação",
      ],
    });
    expect(sacramentAptitude({ attendanceRate: 100, missing: [] })).toEqual({
      eligible: false,
      reasons: ["Sem notas lançadas", "Presença 100%"],
    });
    expect(sacramentAptitude({ average: 15, attendanceRate: 0, missing: [] })).toEqual({
      eligible: false,
      reasons: ["Média 15,0", "Presença 0% (abaixo de 75%)"],
    });
    // Sem chamadas não penaliza.
    expect(sacramentAptitude({ average: 12, missing: [] })).toEqual({
      eligible: true,
      reasons: ["Média 12,0", "Sem chamadas lançadas"],
    });
  });

  it("lista só as turmas finais do sacramento, e a turma inteira leva só os aptos", async () => {
    await classWith("COMMUNION_1", "A", [{ name: "Zé Pequeno" }]);
    const { klass } = await classWith("COMMUNION_3", "B", [
      { name: "Ana Apta", grade: 14 },
      { name: "Beto Baixo", grade: 8 },
    ]);
    const celebration = await create({
      date: "2027-05-30",
      selection: { classIds: [klass.id], catechumenIds: [] },
    });
    const { items } = await ctx.sacraments.classes.execute({ type: "FIRST_COMMUNION" });
    expect(items).toEqual([
      {
        id: klass.id,
        label: "Comunhão · 3.º ano · B",
        level: "COMMUNION_3",
        members: 2,
        eligible: 1,
        isCandidateLevel: true,
        special: false,
        sacrament: null,
        audience: null,
        takenBy: { celebrationId: celebration.id, date: "2027-05-30" },
      },
    ]);
    const participants = (await ctx.sacraments.participants.execute({ id: celebration.id })).items;
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({ fullName: "Ana Apta", source: "CLASS", eligible: true });
  });

  it("a repartição por turmas equilibra e é determinística", () => {
    const groups = [
      { key: "b", items: [1, 2] },
      { key: "a", items: [3, 4] },
      { key: "c", items: [5, 6, 7] },
      { key: "d", items: [8] },
    ];
    const once = distributeGroups(groups, 2);
    expect(once).toEqual([
      [5, 6, 7, 8],
      [3, 4, 1, 2],
    ]);
    expect(distributeGroups([...groups].reverse(), 2)).toEqual(once);
    expect(distributeGroups(groups, 0)).toEqual([]);
  });
});
