import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import { matchesCenter, assertSameCenter, type CenterScope } from "../../center-scope.js";
import { luandaToday } from "../../../domain/dates.js";
import {
  AlreadyReceivedError,
  CatechumenNotFoundError,
  InvalidCelebrationError,
  InvalidSacramentRecordError,
  type AlreadyReceivedConflict,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
  SacramentRecordRepository,
  SacramentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import {
  catecheticalYearOf,
  cleanParish,
  isInThisParish,
  PARISH_NAME,
  type SacramentFacts,
  type SacramentRecord,
} from "../../../domain/sacrament-records.js";
import { SACRAMENT_TYPES, type SacramentType } from "../../../domain/sacraments.js";
import { classShortLabel } from "../../messages.js";
import {
  toReceivedView,
  type ReceivedSacramentView,
  type SacramentRecords,
} from "../../sacrament-records.js";
import {
  SACRAMENT_LABEL,
  type CelebrationView,
  type SacramentCelebrations,
} from "./sacraments.use-cases.js";

const formatDate = (date: string) => date.split("-").reverse().join("/");

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** A coordenação acrescenta, corrige ou retira um sacramento na ficha do catequizando. */
export class SetReceivedSacramentUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly records: SacramentRecords,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: {
    actorId: string;
    catechumenId: string;
    type: SacramentType;
    received: boolean;
    /** Sem o campo, fica o que já estava; `null` apaga. */
    date?: string | null;
    parish?: string | null;
    scope?: CenterScope;
  }): Promise<ReceivedSacramentView> {
    const catechumen = await this.catechumens.findById(UniqueId.from(input.catechumenId));
    if (!catechumen) throw new CatechumenNotFoundError();
    assertSameCenter(input.scope, catechumen.centerId);
    const current = (await this.records.current(catechumen.id.value))[input.type];
    let facts: SacramentFacts | null = null;
    if (input.received) {
      facts = {
        date: input.date === undefined ? current?.date : (input.date ?? undefined),
        parish: input.parish === undefined ? current?.parish : cleanParish(input.parish),
        celebrationId: current?.celebrationId,
      };
    }
    const prepared = await this.records.prepare(
      catechumen,
      [{ type: input.type, facts }],
      input.actorId,
    );
    await prepared.commit();
    await this.catechumens.save(catechumen);
    const details = facts
      ? [facts.date && formatDate(facts.date), facts.parish].filter(Boolean).join(", ")
      : "";
    await this.activity.record({
      actorId: input.actorId,
      category: "ENROLLMENT",
      action: "catechesis.sacrament_record_set",
      summary: facts
        ? `${SACRAMENT_LABEL[input.type]} de ${catechumen.fullName}: registado${details ? ` (${details})` : ""}`
        : `${SACRAMENT_LABEL[input.type]} de ${catechumen.fullName}: registo retirado`,
    });
    return toReceivedView(
      input.type,
      (await this.records.current(catechumen.id.value))[input.type],
    );
  }
}

/**
 * Conclui uma celebração: regista quem recebeu de facto (data da celebração,
 * esta paróquia). Pode repetir-se para corrigir: quem sai da lista perde o
 * registo desta celebração; quem entra ganha-o.
 */
export class CompleteCelebrationUseCase {
  constructor(
    private readonly celebrations: SacramentCelebrations,
    private readonly sacraments: SacramentRepository,
    private readonly recordsRepository: SacramentRecordRepository,
    private readonly records: SacramentRecords,
    private readonly catechumens: CatechumenRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorId: string;
    id: string;
    catechumenIds: string[];
  }): Promise<CelebrationView> {
    const year = await this.celebrations.candidates.year();
    const celebration = await this.celebrations.find(input.id, year);
    const now = this.clock.now();
    if (celebration.date > luandaToday(now)) {
      throw new InvalidCelebrationError(
        `Só pode registar quem recebeu a partir do dia da celebração (${formatDate(celebration.date)}).`,
      );
    }
    const { type } = celebration;
    const ids = [...new Set(input.catechumenIds)];

    // Quem pode constar: os participantes (como se ainda estivesse marcada) e
    // quem já a recebeu nesta celebração.
    const [plan, existing] = await Promise.all([
      this.celebrations.plan(year, type, undefined, celebration.id),
      this.recordsRepository.listForCelebration(celebration.id),
    ]);
    const allowed = new Set([
      ...(plan.participants.get(celebration.id) ?? []).map((item) => item.catechumenId),
      ...existing.map((item) => item.catechumenId),
    ]);
    if (ids.some((id) => !allowed.has(id))) {
      throw new InvalidCelebrationError(
        "Há catequizandos que não são participantes desta celebração.",
      );
    }

    const mine = new Set(existing.map((item) => item.catechumenId));
    const toAdd = ids.filter((id) => !mine.has(id));
    const toRemove = existing.filter((item) => !ids.includes(item.catechumenId));
    const people = new Map(
      (
        await this.catechumens.findByIds([...toAdd, ...toRemove.map((item) => item.catechumenId)])
      ).map((item) => [item.id.value, item]),
    );

    // Já tem o sacramento registado de outra origem (outra celebração, a matrícula…).
    const others = (await this.recordsRepository.listForCatechumens(toAdd)).filter(
      (item) => item.type === type,
    );
    if (others.length) {
      throw new AlreadyReceivedError(
        others.map((item): AlreadyReceivedConflict => ({
          catechumenId: item.catechumenId,
          fullName: people.get(item.catechumenId)?.fullName ?? "Catequizando",
          date: item.date ?? null,
          parish: item.parish ?? null,
          celebrationId: item.celebrationId ?? null,
        })),
      );
    }

    // Valida tudo antes de gravar (ex.: a Comunhão exige o Batismo).
    const prepared: { catechumen: Catechumen; commit: () => Promise<void> }[] = [];
    const facts: SacramentFacts = {
      date: celebration.date,
      parish: PARISH_NAME,
      celebrationId: celebration.id,
    };
    for (const [id, change] of [
      ...toRemove.map((item) => [item.catechumenId, null] as const),
      ...toAdd.map((id) => [id, facts] as const),
    ]) {
      const catechumen = people.get(id);
      if (!catechumen) continue;
      try {
        const { commit } = await this.records.prepare(
          catechumen,
          [{ type, facts: change }],
          input.actorId,
        );
        prepared.push({ catechumen, commit });
      } catch (error) {
        if (error instanceof InvalidSacramentRecordError) {
          throw new InvalidSacramentRecordError(`${catechumen.fullName}: ${error.message}`);
        }
        throw error;
      }
    }
    for (const { catechumen, commit } of prepared) {
      await commit();
      await this.catechumens.save(catechumen);
    }

    const correcting = Boolean(celebration.completedAt);
    const completed = {
      ...celebration,
      completedAt: celebration.completedAt ?? now,
      completedBy: celebration.completedBy ?? input.actorId,
      updatedAt: now,
      updatedBy: input.actorId,
    };
    await this.sacraments.saveCelebration(completed);
    await this.activity.record({
      actorId: input.actorId,
      category: "ENROLLMENT",
      action: correcting
        ? "catechesis.sacrament_celebration_corrected"
        : "catechesis.sacrament_celebration_completed",
      summary: `${correcting ? "Corrigiu" : "Concluiu"} a celebração (${SACRAMENT_LABEL[type]}, ${formatDate(celebration.date)}): ${ids.length} ${ids.length === 1 ? "recebeu" : "receberam"}`,
    });
    return this.celebrations.view(await this.celebrations.candidates.year(), completed);
  }
}

export type RecordOrigin = "ALL" | "THIS_PARISH" | "OTHER";

export interface SacramentRecordView {
  id: string;
  type: SacramentType;
  catechumenId: string;
  catechumenName: string;
  birthDate: string;
  date: string | null;
  parish: string | null;
  inThisParish: boolean;
  celebrationId: string | null;
  /** Turma do ano em que recebeu (se havia). */
  classLabel: string | null;
  guardianName: string | null;
  recordedAt: string;
}

export interface SacramentRecordsQuery {
  type?: SacramentType;
  from?: string;
  to?: string;
  search?: string;
  origin?: RecordOrigin;
  celebrationId?: string;
  centerId?: string;
  page: number;
  pageSize: number;
}

/** Dentro do intervalo de datas (sem intervalo, todos; com intervalo, só os que têm data). */
const inRange = (record: SacramentRecord, from?: string, to?: string) =>
  (!from && !to) ||
  (record.date !== undefined && (!from || record.date >= from) && (!to || record.date <= to));

/** Sacramentos realizados: filtros, pesquisa, páginas (até 1000 para imprimir). */
export class ListSacramentRecordsUseCase {
  constructor(
    private readonly records: SacramentRecordRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly sacraments: SacramentRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute(query: SacramentRecordsQuery) {
    const origin = query.origin ?? "ALL";
    const found = (await this.records.list(query.type)).filter(
      (record) =>
        (!query.celebrationId || record.celebrationId === query.celebrationId) &&
        (origin === "ALL" || isInThisParish(record) === (origin === "THIS_PARISH")) &&
        inRange(record, query.from, query.to),
    );
    const catechumens = new Map(
      (await this.catechumens.findByIds([...new Set(found.map((item) => item.catechumenId))])).map(
        (item) => [item.id.value, item],
      ),
    );
    const guardians = new Map(
      (
        await this.people.findMany(
          [...catechumens.values()].flatMap((item) =>
            item.guardianAccountId ? [item.guardianAccountId] : [],
          ),
        )
      ).map((person) => [person.id, person.fullName]),
    );
    const guardianOf = (catechumen: Catechumen) =>
      catechumen.guardianAccountId ? (guardians.get(catechumen.guardianAccountId) ?? null) : null;
    const search = normalize(query.search?.trim() ?? "");
    const rows = found
      .flatMap((record) => {
        const catechumen = catechumens.get(record.catechumenId);
        return catechumen ? [{ record, catechumen }] : [];
      })
      .filter(
        ({ catechumen }) =>
          matchesCenter(catechumen.centerId, query.centerId) &&
          (!search ||
            normalize(`${catechumen.fullName} ${guardianOf(catechumen) ?? ""}`).includes(search)),
      )
      .sort(
        (a, b) =>
          // Data mais recente primeiro; sem data no fim; depois o nome.
          (b.record.date ?? "").localeCompare(a.record.date ?? "") ||
          a.catechumen.fullName.localeCompare(b.catechumen.fullName, "pt"),
      );
    const page = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const labels = await this.classLabels(page.map(({ record }) => record));
    return {
      items: page.map(({ record, catechumen }): SacramentRecordView => ({
        id: record.id,
        type: record.type,
        catechumenId: catechumen.id.value,
        catechumenName: catechumen.fullName,
        birthDate: catechumen.birthDate,
        date: record.date ?? null,
        parish: record.parish ?? null,
        inThisParish: isInThisParish(record),
        celebrationId: record.celebrationId ?? null,
        classLabel: labels.get(record.id) ?? null,
        guardianName: guardianOf(catechumen),
        recordedAt: record.recordedAt.toISOString(),
      })),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** A turma do catequizando no ano catequético em que recebeu o sacramento. */
  private async classLabels(records: SacramentRecord[]): Promise<Map<string, string>> {
    const celebrationYears = new Map<string, string>();
    for (const id of new Set(records.flatMap((item) => item.celebrationId ?? []))) {
      const celebration = await this.sacraments.findCelebration(id);
      if (celebration) celebrationYears.set(id, celebration.catecheticalYear);
    }
    const yearOf = (record: SacramentRecord) =>
      (record.celebrationId && celebrationYears.get(record.celebrationId)) ||
      (record.date ? catecheticalYearOf(record.date) : undefined);
    const enrollments = await this.enrollments.listForCatechumens([
      ...new Set(records.map((item) => item.catechumenId)),
    ]);
    const classIds = enrollments.flatMap((item) =>
      item.isConfirmed && item.classId ? [item.classId] : [],
    );
    const classes = new Map(
      (await this.classes.findByIds([...new Set(classIds)])).map((item) => [item.id.value, item]),
    );
    const labels = new Map<string, string>();
    for (const record of records) {
      const year = yearOf(record);
      const enrollment = enrollments.find(
        (item) =>
          item.catechumenId === record.catechumenId &&
          item.catecheticalYear === year &&
          item.isConfirmed &&
          item.classId,
      );
      const klass = enrollment?.classId ? classes.get(enrollment.classId) : undefined;
      if (klass) labels.set(record.id, classShortLabel(klass));
    }
    return labels;
  }
}

/** Totais por sacramento (só com data no intervalo; sem intervalo, todos). */
export class SacramentRecordsSummaryUseCase {
  constructor(private readonly records: SacramentRecordRepository) {}

  async execute(query: { from?: string; to?: string }): Promise<Record<SacramentType, number>> {
    const found = (await this.records.list()).filter((record) =>
      inRange(record, query.from, query.to),
    );
    return Object.fromEntries(
      SACRAMENT_TYPES.map((type) => [type, found.filter((item) => item.type === type).length]),
    ) as Record<SacramentType, number>;
  }
}
