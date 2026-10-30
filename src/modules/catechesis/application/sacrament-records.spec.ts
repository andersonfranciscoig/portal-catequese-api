import { beforeEach, describe, expect, it } from "vitest";

import { UniqueId } from "../../../shared/domain/unique-id.js";
import {
  AlreadyReceivedError,
  InvalidCelebrationError,
  InvalidSacramentRecordError,
} from "../domain/errors/catechesis.errors.js";
import {
  assertCoherent,
  backfillRecords,
  catecheticalYearOf,
  isInThisParish,
  mergeDeclared,
  PARISH_NAME,
} from "../domain/sacrament-records.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

const BIRTH = "2015-03-10";
const TODAY = "2026-10-13";

/** Turma de Comunhão 3.º ano (sábado de manhã) com catequizandos batizados e confirmados. */
async function communionClass(names: string[], section = "A") {
  const klass = await ctx.createClass.execute({
    actorId: IDS.coordinator,
    level: "COMMUNION_3",
    section,
    slot: "SATURDAY_MORNING",
    startTime: "08:00",
    room: `Sala ${section}`,
    capacity: 30,
  });
  const ids: Record<string, string> = {};
  for (const fullName of names) {
    const enrollment = await ctx.submit.execute({
      accountId: IDS.guardian,
      guardian: { relationship: "FATHER" },
      catechumen: {
        fullName,
        birthDate: BIRTH,
        gender: "FEMALE",
        sacraments: { baptism: true, firstCommunion: false, baptismDate: "2015-06-07" },
      },
      catechesis: { type: "NEW", level: "COMMUNION_3", preferredSlot: "SATURDAY_MORNING" },
      allowLate: true,
    });
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    ids[fullName] = enrollment.catechumenId;
  }
  return { klass, ids };
}

const catechumen = async (id: string) => (await ctx.catechumens.findById(UniqueId.from(id)))!;

describe("Regras dos registos de sacramentos", () => {
  it("a migração cria um registo sem data por cada sim/não", () => {
    let n = 0;
    const at = new Date("2026-10-01T00:00:00Z");
    const records = backfillRecords(
      [
        { id: "a", baptized: true, firstCommunion: true, updatedAt: at },
        { id: "b", baptized: true, firstCommunion: false, updatedAt: at },
        { id: "c", baptized: false, firstCommunion: false, updatedAt: at },
      ],
      () => `r${++n}`,
    );
    expect(records).toEqual([
      { id: "r1", catechumenId: "a", type: "BAPTISM", recordedAt: at },
      { id: "r2", catechumenId: "a", type: "FIRST_COMMUNION", recordedAt: at },
      { id: "r3", catechumenId: "b", type: "BAPTISM", recordedAt: at },
    ]);
    expect(records.every((item) => !item.date && !item.parish && !item.celebrationId)).toBe(true);
  });

  it("ordem e datas: 422 com mensagem clara", () => {
    const check = (records: Parameters<typeof assertCoherent>[0]) => () =>
      assertCoherent(records, { birthDate: BIRTH, today: TODAY });
    expect(check({ FIRST_COMMUNION: {} })).toThrow("A Primeira Comunhão exige o Batismo.");
    expect(check({ BAPTISM: {}, CONFIRMATION: {} })).toThrow("O Crisma exige a Primeira Comunhão.");
    expect(check({ BAPTISM: { date: "2026-10-14" } })).toThrow(
      "A data do Batismo não pode ser no futuro.",
    );
    expect(check({ BAPTISM: { date: "2015-03-09" } })).toThrow(
      "A data do Batismo não pode ser antes do nascimento (10/03/2015).",
    );
    expect(
      check({ BAPTISM: { date: "2020-05-01" }, FIRST_COMMUNION: { date: "2019-05-01" } }),
    ).toThrow("A Primeira Comunhão não pode ser antes do Batismo (01/05/2020).");
    expect(check({ BAPTISM: { date: "2015-03-10" }, FIRST_COMMUNION: {} })).not.toThrow();
    expect(check({ FIRST_COMMUNION: {} })).toThrow(InvalidSacramentRecordError);
  });

  it("a matrícula só preenche o que falta; os da paróquia contam como desta paróquia", () => {
    expect(mergeDeclared(undefined, { date: "2016-01-01", parish: "São José" })).toEqual({
      date: "2016-01-01",
      parish: "São José",
    });
    expect(
      mergeDeclared({ date: "2015-06-07" }, { date: "2016-01-01", parish: "São José" }),
    ).toEqual({ date: "2015-06-07", parish: "São José" });
    const fromCelebration = { date: "2027-05-30", parish: PARISH_NAME, celebrationId: "c1" };
    expect(mergeDeclared(fromCelebration, { date: "2016-01-01" })).toBe(fromCelebration);
    expect(isInThisParish({ parish: " paróquia  cristo rei da PAZ " })).toBe(true);
    expect(isInThisParish({ parish: "Paróquia de São José" })).toBe(false);
    expect(isInThisParish({ celebrationId: "c1" })).toBe(true);
    expect(catecheticalYearOf("2026-10-10")).toBe("2026/2027");
    expect(catecheticalYearOf("2027-05-30")).toBe("2026/2027");
  });
});

describe("Sacramentos na ficha e na matrícula", () => {
  it("a matrícula cria os registos com data e paróquia, e a ficha mostra os três", async () => {
    const enrollment = await ctx.submit.execute({
      accountId: IDS.guardian,
      guardian: { relationship: "MOTHER" },
      catechumen: {
        fullName: "Inês Francisco",
        birthDate: BIRTH,
        gender: "FEMALE",
        sacraments: {
          baptism: true,
          firstCommunion: true,
          baptismDate: "2015-06-07",
          baptismParish: "  Paróquia de São José ",
          firstCommunionDate: "2024-05-26",
          firstCommunionParish: null,
        },
      },
      catechesis: { type: "NEW", level: "BIBLICAL", preferredSlot: "SATURDAY_MORNING" },
      allowLate: true,
    });
    const file = await ctx.catechumenFile.execute({ catechumenId: enrollment.catechumenId });
    expect(file.sacraments).toEqual([
      {
        type: "BAPTISM",
        received: true,
        date: "2015-06-07",
        parish: "Paróquia de São José",
        inThisParish: false,
        celebrationId: null,
      },
      {
        type: "FIRST_COMMUNION",
        received: true,
        date: "2024-05-26",
        parish: null,
        inThisParish: false,
        celebrationId: null,
      },
      {
        type: "CONFIRMATION",
        received: false,
        date: null,
        parish: null,
        inThisParish: false,
        celebrationId: null,
      },
    ]);
    const profile = await ctx.profile.execute({
      accountId: IDS.guardian,
      catechumenId: enrollment.catechumenId,
    });
    expect(profile.sacraments.map((item) => item.received)).toEqual([true, true, false]);
  });

  it("recusa datas impossíveis na matrícula sem gravar nada", async () => {
    await expect(
      ctx.submit.execute({
        accountId: IDS.guardian,
        guardian: { relationship: "MOTHER" },
        catechumen: {
          fullName: "Inês Francisco",
          birthDate: BIRTH,
          gender: "FEMALE",
          sacraments: {
            baptism: true,
            firstCommunion: true,
            baptismDate: "2020-01-01",
            firstCommunionDate: "2019-01-01",
          },
        },
        catechesis: { type: "NEW", level: "BIBLICAL", preferredSlot: "SATURDAY_MORNING" },
        allowLate: true,
      }),
    ).rejects.toThrow("A Primeira Comunhão não pode ser antes do Batismo (01/01/2020).");
    expect(ctx.enrollments.items.size).toBe(0);
    expect(ctx.recordRepository.items.size).toBe(0);
  });

  it("a coordenação acrescenta, corrige e retira, mantendo os sim/não coerentes", async () => {
    const { ids } = await communionClass(["Ana Apta"]);
    const id = ids["Ana Apta"];
    const set = (input: Partial<Parameters<typeof ctx.setReceivedSacrament.execute>[0]>) =>
      ctx.setReceivedSacrament.execute({
        actorId: IDS.coordinator,
        catechumenId: id,
        type: "FIRST_COMMUNION",
        received: true,
        ...input,
      });

    await expect(set({ type: "CONFIRMATION" })).rejects.toThrow(
      "O Crisma exige a Primeira Comunhão.",
    );
    await expect(set({ date: "2015-01-01" })).rejects.toThrow(InvalidSacramentRecordError);

    expect(await set({ date: "2024-05-26", parish: "Paróquia de São José" })).toEqual({
      type: "FIRST_COMMUNION",
      received: true,
      date: "2024-05-26",
      parish: "Paróquia de São José",
      inThisParish: false,
      celebrationId: null,
    });
    expect((await catechumen(id)).firstCommunion).toBe(true);
    expect(ctx.activity.entries.at(-1)).toMatchObject({
      action: "catechesis.sacrament_record_set",
      summary: "Primeira Comunhão de Ana Apta: registado (26/05/2024, Paróquia de São José)",
    });
    // Sem `date`, fica a que estava; a paróquia muda.
    expect(await set({ parish: PARISH_NAME })).toMatchObject({
      date: "2024-05-26",
      inThisParish: true,
    });

    // Não se retira o Batismo enquanto houver Comunhão.
    await expect(set({ type: "BAPTISM", received: false })).rejects.toThrow(
      "Retire primeiro a Primeira Comunhão: não pode ficar sem o Batismo.",
    );
    expect(await set({ received: false })).toMatchObject({ received: false, date: null });
    const after = await catechumen(id);
    expect([after.baptized, after.firstCommunion]).toEqual([true, false]);
    expect(await set({ type: "BAPTISM", received: false })).toMatchObject({ received: false });
    expect((await catechumen(id)).baptized).toBe(false);
  });
});

describe("Concluir uma celebração", () => {
  async function scheduled(names: string[], date = "2026-10-10") {
    const { klass, ids } = await communionClass(names);
    const celebration = await ctx.sacraments.create.execute({
      actorId: IDS.coordinator,
      type: "FIRST_COMMUNION",
      date,
      place: "Igreja Cristo Rei da Paz",
      selection: { classIds: [klass.id], catechumenIds: [] },
    });
    return { klass, ids, celebration };
  }

  it("só depois da data; regista quem recebeu e corrige se repetir", async () => {
    const { ids, celebration } = await scheduled(["Ana Apta", "Beto Bento", "Carla Costa"]);
    const future = await ctx.sacraments.create.execute({
      actorId: IDS.coordinator,
      type: "FIRST_COMMUNION",
      date: "2026-10-17",
      place: "Igreja Cristo Rei da Paz",
      selection: { classIds: [], catechumenIds: [] },
    });
    await expect(
      ctx.sacraments.complete.execute({
        actorId: IDS.coordinator,
        id: future.id,
        catechumenIds: [],
      }),
    ).rejects.toThrow("a partir do dia da celebração (17/10/2026)");

    expect(celebration).toMatchObject({ status: "SCHEDULED", completedAt: null, receivedCount: 0 });
    await expect(
      ctx.sacraments.complete.execute({
        actorId: IDS.coordinator,
        id: celebration.id,
        catechumenIds: ["00000000-0000-4000-8000-0000000000aa"],
      }),
    ).rejects.toThrow("não são participantes");

    const done = await ctx.sacraments.complete.execute({
      actorId: IDS.coordinator,
      id: celebration.id,
      catechumenIds: [ids["Ana Apta"], ids["Beto Bento"]],
    });
    expect(done).toMatchObject({
      status: "COMPLETED",
      completedAt: "2026-10-13T10:00:00.000Z",
      receivedCount: 2,
      participants: 2,
    });
    expect(
      (await ctx.profile.execute({ accountId: IDS.guardian, catechumenId: ids["Ana Apta"] }))
        .sacraments[1],
    ).toEqual({
      type: "FIRST_COMMUNION",
      received: true,
      date: "2026-10-10",
      parish: PARISH_NAME,
      inThisParish: true,
      celebrationId: celebration.id,
    });
    expect((await catechumen(ids["Beto Bento"])).firstCommunion).toBe(true);

    // Deixam de ser candidatos; quem não recebeu volta a sê-lo.
    const candidates = await ctx.sacraments.candidates.execute({ type: "FIRST_COMMUNION" });
    expect(candidates.items.map((item) => item.fullName)).toEqual(["Carla Costa"]);
    expect(
      (await ctx.sacraments.participants.execute({ id: celebration.id })).items.map(
        (item) => item.fullName,
      ),
    ).toEqual(["Ana Apta", "Beto Bento"]);

    // Repetir com a mesma lista não muda nada.
    ctx.clock.advance(60_000);
    const again = await ctx.sacraments.complete.execute({
      actorId: IDS.coordinator,
      id: celebration.id,
      catechumenIds: [ids["Beto Bento"], ids["Ana Apta"]],
    });
    expect(again).toMatchObject({ receivedCount: 2, completedAt: "2026-10-13T10:00:00.000Z" });
    expect(ctx.recordRepository.items.size).toBe(3 + 2);

    // Corrigir: o Beto afinal não recebeu; a Carla sim.
    const fixed = await ctx.sacraments.complete.execute({
      actorId: IDS.coordinator,
      id: celebration.id,
      catechumenIds: [ids["Ana Apta"], ids["Carla Costa"]],
    });
    expect(fixed.receivedCount).toBe(2);
    expect((await catechumen(ids["Beto Bento"])).firstCommunion).toBe(false);
    expect((await catechumen(ids["Carla Costa"])).firstCommunion).toBe(true);
    expect(ctx.activity.entries.at(-1)?.action).toBe("catechesis.sacrament_celebration_corrected");

    // Concluída: não se apaga; só muda a hora, o local e as notas.
    await expect(
      ctx.sacraments.remove.execute({ actorId: IDS.coordinator, id: celebration.id }),
    ).rejects.toThrow(InvalidCelebrationError);
    const update = {
      actorId: IDS.coordinator,
      id: celebration.id,
      date: "2026-10-10",
      place: "Sé Catedral",
      time: "10:00",
      selection: celebration.selection,
    };
    await expect(ctx.sacraments.update.execute({ ...update, date: "2026-10-03" })).rejects.toThrow(
      "só pode alterar a hora, o local e as notas",
    );
    expect(await ctx.sacraments.update.execute(update)).toMatchObject({
      place: "Sé Catedral",
      time: "10:00",
      status: "COMPLETED",
    });
  });

  it("409 quando alguém já tem o sacramento registado de outra origem", async () => {
    const { ids, celebration } = await scheduled(["Ana Apta", "Carla Costa"]);
    await ctx.setReceivedSacrament.execute({
      actorId: IDS.coordinator,
      catechumenId: ids["Carla Costa"],
      type: "FIRST_COMMUNION",
      received: true,
      date: "2025-06-01",
      parish: "Paróquia de São José",
    });
    const error = await ctx.sacraments.complete
      .execute({
        actorId: IDS.coordinator,
        id: celebration.id,
        catechumenIds: [ids["Ana Apta"], ids["Carla Costa"]],
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AlreadyReceivedError);
    expect(error).toMatchObject({
      code: "sacraments.already_received",
      details: {
        conflicts: [
          {
            catechumenId: ids["Carla Costa"],
            fullName: "Carla Costa",
            date: "2025-06-01",
            parish: "Paróquia de São José",
            celebrationId: null,
          },
        ],
      },
    });
    // Nada foi gravado.
    expect((await catechumen(ids["Ana Apta"])).firstCommunion).toBe(false);
  });
});

describe("Sacramentos realizados", () => {
  it("filtra por tipo, origem, datas, pesquisa e celebração, com páginas e totais", async () => {
    const { klass, ids } = await communionClass(["Ana Apta", "Beto Bento", "Carla Costa"]);
    const celebration = await ctx.sacraments.create.execute({
      actorId: IDS.coordinator,
      type: "FIRST_COMMUNION",
      date: "2026-10-10",
      place: "Igreja Cristo Rei da Paz",
      selection: { classIds: [klass.id], catechumenIds: [] },
    });
    await ctx.sacraments.complete.execute({
      actorId: IDS.coordinator,
      id: celebration.id,
      catechumenIds: [ids["Ana Apta"], ids["Beto Bento"]],
    });
    await ctx.setReceivedSacrament.execute({
      actorId: IDS.coordinator,
      catechumenId: ids["Carla Costa"],
      type: "FIRST_COMMUNION",
      received: true,
      date: "2025-06-01",
      parish: "Paróquia de São José",
    });
    const list = (query: Partial<Parameters<typeof ctx.sacraments.records.execute>[0]>) =>
      ctx.sacraments.records.execute({ page: 1, pageSize: 50, ...query });

    // Batismos da matrícula (2015-06-07) + 3 Comunhões.
    expect((await list({})).total).toBe(6);
    const communions = await list({ type: "FIRST_COMMUNION" });
    expect(communions.items.map((item) => [item.catechumenName, item.date])).toEqual([
      ["Ana Apta", "2026-10-10"],
      ["Beto Bento", "2026-10-10"],
      ["Carla Costa", "2025-06-01"],
    ]);
    expect(communions.items[0]).toMatchObject({
      inThisParish: true,
      parish: PARISH_NAME,
      celebrationId: celebration.id,
      classLabel: "Comunhão · 3.º ano · A",
      guardianName: "Anderson Francisco",
      birthDate: BIRTH,
    });
    expect(communions.items[2]).toMatchObject({ inThisParish: false, classLabel: null });

    expect((await list({ type: "FIRST_COMMUNION", origin: "OTHER" })).items).toHaveLength(1);
    expect((await list({ origin: "THIS_PARISH" })).total).toBe(2);
    expect((await list({ celebrationId: celebration.id })).total).toBe(2);
    expect((await list({ from: "2026-01-01", to: "2026-12-31" })).total).toBe(2);
    expect((await list({ to: "2025-12-31" })).items.map((item) => item.type)).toEqual([
      "FIRST_COMMUNION",
      "BAPTISM",
      "BAPTISM",
      "BAPTISM",
    ]);
    expect((await list({ search: "beto" })).total).toBe(2);
    expect((await list({ search: "ANDERSON" })).total).toBe(6);
    const page = await list({ type: "FIRST_COMMUNION", page: 2, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items.map((item) => item.catechumenName)).toEqual(["Carla Costa"]);

    expect(await ctx.sacraments.summary.execute({})).toEqual({
      BAPTISM: 3,
      FIRST_COMMUNION: 3,
      CONFIRMATION: 0,
    });
    expect(await ctx.sacraments.summary.execute({ from: "2026-01-01" })).toEqual({
      BAPTISM: 0,
      FIRST_COMMUNION: 2,
      CONFIRMATION: 0,
    });
  });

  it("registos sem data ficam no fim e só aparecem sem filtro de datas", async () => {
    await ctx.recordRepository.save({
      id: "r-old",
      catechumenId: (await communionClass(["Ana Apta"])).ids["Ana Apta"],
      type: "CONFIRMATION",
      recordedAt: new Date(),
    });
    const all = await ctx.sacraments.records.execute({ page: 1, pageSize: 50 });
    expect(all.items.at(-1)).toMatchObject({ type: "CONFIRMATION", date: null });
    const ranged = await ctx.sacraments.records.execute({
      page: 1,
      pageSize: 50,
      from: "2000-01-01",
    });
    expect(ranged.items.some((item) => item.date === null)).toBe(false);
  });
});
