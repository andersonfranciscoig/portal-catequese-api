import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { centerRef, SEDE_CENTER_ID } from "../../../domain/center.js";
import type { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import {
  CatechesisLevel,
  type CatechesisLevel as Level,
  type EnrollmentStatus,
} from "../../../domain/catechesis.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import { attendanceTotals, type ClassAttendance } from "../../../domain/class-attendance.js";
import { addMonths, isIsoDate } from "../../../domain/dates.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import {
  CalendarNotDefinedError,
  CenterForbiddenError,
  CelebrationNotFoundError,
  ClassNotFoundError,
  InvalidCelebrationError,
  InvalidSacramentError,
  ParticipantConflictError,
  SacramentCandidateNotFoundError,
  type ParticipantConflict,
} from "../../../domain/errors/catechesis.errors.js";
import { averageGrade, type Evaluation } from "../../../domain/evaluation.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
  EvaluationRepository,
  SacramentRecordRepository,
  SacramentRepository,
  CenterRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import {
  assertSameCenter,
  matchesCenter,
  resolveWriteCenter,
  type CenterScope,
} from "../../center-scope.js";
import type { SacramentRecord } from "../../../domain/sacrament-records.js";
import {
  CANDIDATE_LEVEL,
  CANDIDATE_LEVELS,
  isCandidateLevel,
  selectionSacramentTypes,
  celebrationMode,
  compareCelebrations,
  distributeGroups,
  isCheckable,
  requirementStates,
  SACRAMENT_TYPES,
  sacramentAptitude,
  type CelebrationMode,
  type CelebrationSelection,
  type CelebrationStatus,
  type CheckableRequirement,
  type RequirementState,
  type SacramentCelebration,
  type SacramentRequirement,
  type SacramentType,
} from "../../../domain/sacraments.js";
import { classShortLabel } from "../../messages.js";

/** Local habitual das celebrações (a UI sugere-o ao criar). */
export const PARISH_CHURCH = "Igreja Cristo Rei da Paz";

export const SACRAMENT_LABEL: Record<SacramentType, string> = {
  BAPTISM: "Batismo",
  FIRST_COMMUNION: "Primeira Comunhão",
  CONFIRMATION: "Crisma",
};

const REQUIREMENT_LABEL: Record<SacramentRequirement, string> = {
  BAPTIZED: "Batizado",
  FIRST_COMMUNION: "Primeira Comunhão",
  BIRTH_CERTIFICATE: "Cédula ou certidão de nascimento",
  BAPTISM_CERTIFICATE: "Certidão de batismo",
  RECONCILIATION: "Primeira Reconciliação",
  GODPARENT: "Padrinho ou madrinha",
  PARENTS_MEETING: "Encontro de preparação com os pais",
};

/** Matrículas aceites pela coordenação: quem conta como candidato ou participante. */
const ACCEPTED: EnrollmentStatus[] = ["APPROVED", "PENDING_CONFIRMATION", "CONFIRMED"];

/** Matrículas em curso no ano (para os sacramentos já recebidos). */
const ACTIVE: EnrollmentStatus[] = [...ACCEPTED, "SUBMITTED", "UNDER_REVIEW", "WAITLIST"];

/** Uma celebração pode ser até 3 meses depois do fim da catequese. */
const MONTHS_AFTER_YEAR = 3;

const LEVEL_ORDER = Object.values(CatechesisLevel);

export interface CelebrationView {
  id: string;
  type: SacramentType;
  /** Batismo celebrado junto com a Primeira Comunhão. */
  withCommunion: boolean;
  /** YYYY-MM-DD */
  date: string;
  /** "HH:mm" */
  time: string | null;
  place: string;
  notes: string | null;
  mode: CelebrationMode;
  selection: CelebrationSelection;
  /** Efetivos (MANUAL: os escolhidos; AUTO: os sugeridos). */
  participants: number;
  /** Destes, quantos têm todos os requisitos. */
  ready: number;
  /** Concluída quando a coordenação registou quem recebeu. */
  status: CelebrationStatus;
  completedAt: string | null;
  /** Quantos receberam nesta celebração (registos dela). */
  receivedCount: number;
  center: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface SacramentTypeSummary {
  type: SacramentType;
  /** Nível candidato por omissão. */
  level: Level;
  candidates: number;
  ready: number;
  /** Candidatos já nalguma celebração (manual ou automática). */
  assigned: number;
  unassigned: number;
}

export interface SacramentsOverviewView {
  catecheticalYear: string;
  /** Todas as celebrações do ano, por data. */
  celebrations: CelebrationView[];
  types: SacramentTypeSummary[];
  /** Catequizandos com matrícula no ano que já receberam cada sacramento. */
  received: { BAPTISM: number; FIRST_COMMUNION: number };
  active: number;
}

export interface CandidateView {
  catechumenId: string;
  enrollmentId: string;
  enrollmentCode: string;
  fullName: string;
  birthDate: string;
  level: Level;
  classSection?: string;
  guardianName?: string;
  /** Frequência no ano (só encontros com chamada lançada). */
  attendanceRate?: number;
  requirements: RequirementState[];
  ready: boolean;
}

export type ParticipantSource = "SUGGESTED" | "CLASS" | "INDIVIDUAL";

/** Um catequizando avaliado para um sacramento (nota, presença e requisitos). */
export interface ParticipantView extends Omit<CandidateView, "attendanceRate"> {
  classId: string | null;
  /** "Comunhão · 3.º ano · A" */
  classLabel: string | null;
  /** Média das notas (0–20). */
  average: number | null;
  /** Percentagem de presenças. */
  attendanceRate: number | null;
  /** Média ≥ 10, presença ≥ 75% e requisitos cumpridos. */
  eligible: boolean;
  /** Porquê: "Média 14,5", "Presença 92%", "Falta: Certidão de batismo"… */
  reasons: string[];
  /** Porque está nesta celebração. */
  source: ParticipantSource;
}

export interface SelectableClassView {
  id: string;
  label: string;
  level: Level;
  /** Matrículas confirmadas. */
  members: number;
  /** Quantos o sistema considera aptos para este sacramento. */
  eligible: number;
  /** Nível que prepara este sacramento (aparece primeiro). */
  isCandidateLevel: boolean;
  special: boolean;
  sacrament: SacramentType | null;
  audience: "CHILD" | "ADULT" | null;
  /** A turma inteira já está noutra celebração do mesmo sacramento. */
  takenBy: { celebrationId: string; date: string } | null;
}

export type CandidateFilter = "ALL" | "READY" | "PENDING";

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const byName = (a: { fullName: string }, b: { fullName: string }) =>
  a.fullName.localeCompare(b.fullName, "pt");

/** Sugestão: melhor média primeiro, depois melhor presença (sem chamadas no fim) e o nome. */
const bySuggestion = (a: ParticipantView, b: ParticipantView) =>
  (b.average ?? -1) - (a.average ?? -1) ||
  (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1) ||
  byName(a, b);

const formatDate = (date: string) => date.split("-").reverse().join("/");

interface Pair {
  enrollment: Enrollment;
  catechumen: Catechumen;
}

/**
 * Dados do ano lidos uma vez por pedido (matrículas aceites, turmas, chamadas e
 * notas de cada turma), partilhados pelos vários sacramentos.
 */
export class SacramentYear {
  private pairsLoad?: Promise<Pair[]>;
  private classesLoad?: Promise<CatechesisClass[]>;
  private recordsLoad?: Promise<SacramentRecord[]>;
  private readonly rolls = new Map<string, Promise<ClassAttendance[]>>();
  private readonly grades = new Map<string, Promise<Evaluation[]>>();

  constructor(
    readonly calendar: CatecheticalCalendar,
    private readonly deps: {
      enrollments: EnrollmentRepository;
      catechumens: CatechumenRepository;
      classes: ClassRepository;
      attendance: AttendanceRepository;
      evaluations: EvaluationRepository;
      records: SacramentRecordRepository;
    },
  ) {}

  /** Sacramentos já registados dos catequizandos do ano. */
  records(): Promise<SacramentRecord[]> {
    this.recordsLoad ??= this.pairs().then((pairs) =>
      this.deps.records.listForCatechumens(pairs.map((pair) => pair.catechumen.id.value)),
    );
    return this.recordsLoad;
  }

  /** Matrículas aceites do ano, com o catequizando. */
  pairs(): Promise<Pair[]> {
    this.pairsLoad ??= (async () => {
      const enrollments = (
        await this.deps.enrollments.list({ catecheticalYear: this.calendar.label })
      ).filter((item) => ACCEPTED.includes(item.status));
      const catechumens = await this.deps.catechumens.findByIds(
        enrollments.map((item) => item.catechumenId),
      );
      const byId = new Map(catechumens.map((item) => [item.id.value, item]));
      return enrollments.flatMap((enrollment) => {
        const catechumen = byId.get(enrollment.catechumenId);
        return catechumen ? [{ enrollment, catechumen }] : [];
      });
    })();
    return this.pairsLoad;
  }

  classes(): Promise<CatechesisClass[]> {
    this.classesLoad ??= this.deps.classes.listByYear(this.calendar.label);
    return this.classesLoad;
  }

  rollsOf(classId: string) {
    if (!this.rolls.has(classId))
      this.rolls.set(classId, this.deps.attendance.listForClass(classId));
    return this.rolls.get(classId)!;
  }

  gradesOf(classId: string) {
    if (!this.grades.has(classId))
      this.grades.set(classId, this.deps.evaluations.listForClass(classId));
    return this.grades.get(classId)!;
  }
}

/** A turma onde a matrícula está confirmada (só essas têm chamadas e notas). */
const classOf = ({ enrollment }: Pair) =>
  enrollment.isConfirmed && enrollment.classId ? enrollment.classId : null;

/** Candidatos de cada sacramento, o estado dos requisitos e o aproveitamento. */
export class SacramentCandidates {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly documents: EnrollmentDocumentRepository,
    private readonly sacraments: SacramentRepository,
    private readonly people: PeopleDirectory,
    private readonly records: SacramentRecordRepository,
  ) {}

  async calendar(): Promise<CatecheticalCalendar> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    return calendar;
  }

  /** Dados do ano para um pedido (com cache por turma). */
  async year(calendar?: CatecheticalCalendar): Promise<SacramentYear> {
    return new SacramentYear(calendar ?? (await this.calendar()), {
      enrollments: this.enrollments,
      catechumens: this.catechumens,
      classes: this.classes,
      attendance: this.attendance,
      evaluations: this.evaluations,
      records: this.records,
    });
  }

  /**
   * Matrículas do ano que podem receber o sacramento: sem quem já o tem
   * registado (ex.: recebeu-o numa celebração concluída). `reopen` (ao
   * concluir ou corrigir uma celebração) conta com todos, para se saber quem
   * lá estava e avisar de quem já o tinha de outra origem.
   */
  async eligiblePairs(year: SacramentYear, type: SacramentType, reopen?: string): Promise<Pair[]> {
    if (reopen) return year.pairs();
    const received = new Set(
      (await year.records()).filter((item) => item.type === type).map((item) => item.catechumenId),
    );
    return (await year.pairs()).filter(({ catechumen }) => !received.has(catechumen.id.value));
  }

  /** Candidatos do percurso: o último ano (crisma: 2.º ou 3.º), sem turmas especiais. */
  async candidatePairs(year: SacramentYear, type: SacramentType): Promise<Pair[]> {
    const special = new Set(
      (await year.classes()).filter((item) => item.isSpecial).map((item) => item.id.value),
    );
    return (await this.eligiblePairs(year, type)).filter((pair) => {
      const classId = classOf(pair);
      if (classId && special.has(classId)) return false;
      return CANDIDATE_LEVELS[type].includes(pair.enrollment.level);
    });
  }

  /** Requisitos, notas e presença de cada um (por ordem alfabética). */
  async assess(
    year: SacramentYear,
    type: SacramentType,
    pairs: Pair[],
    source: ParticipantSource = "SUGGESTED",
  ): Promise<ParticipantView[]> {
    if (!pairs.length) return [];
    const enrollmentIds = pairs.map(({ enrollment }) => enrollment.id.value);
    const catechumenIds = pairs.map(({ catechumen }) => catechumen.id.value);
    const classIds = [...new Set(pairs.flatMap((pair) => classOf(pair) ?? []))];
    const [documents, checks, classes, rolls, grades, guardians] = await Promise.all([
      this.documents.listForEnrollments(enrollmentIds),
      this.sacraments.listChecks(catechumenIds, type),
      year.classes(),
      Promise.all(classIds.map((id) => year.rollsOf(id))),
      Promise.all(classIds.map((id) => year.gradesOf(id))),
      this.people.findMany(
        pairs.flatMap(({ catechumen }) =>
          catechumen.guardianAccountId ? [catechumen.guardianAccountId] : [],
        ),
      ),
    ]);
    const marks = rolls.flat();
    const evaluations = grades.flat();
    const guardianName = new Map(guardians.map((person) => [person.id, person.fullName]));

    return pairs
      .map((pair): ParticipantView => {
        const { enrollment, catechumen } = pair;
        const id = catechumen.id.value;
        const classId = classOf(pair);
        const klass = classes.find((item) => item.id.value === classId);
        const requirements = requirementStates(type, {
          baptized: catechumen.baptized,
          firstCommunion: catechumen.firstCommunion,
          documents: documents
            .filter((item) => item.enrollmentId === enrollment.id.value)
            .map((item) => item.kind),
          checks: Object.fromEntries(
            checks
              .filter((item) => item.catechumenId === id)
              .map((item) => [item.requirement, item.met]),
          ),
        });
        const entries = marks
          .filter((roll) => roll.classId === classId)
          .flatMap((roll) =>
            roll.marks
              .filter((mark) => mark.catechumenId === id)
              .map((mark) => ({ date: roll.date, status: mark.status })),
          );
        const rate = attendanceTotals(entries).rate;
        const evaluation = evaluations.find(
          (item) => item.classId === classId && item.catechumenId === id,
        );
        const average = evaluation ? averageGrade(evaluation.grades) : undefined;
        const aptitude = klass?.isSpecial
          ? { eligible: true, reasons: ["Turma especial: pode receber sem o percurso completo."] }
          : sacramentAptitude({
              average,
              attendanceRate: rate,
              missing: requirements
                .filter((item) => !item.met)
                .map((item) => REQUIREMENT_LABEL[item.requirement]),
            });
        return {
          catechumenId: id,
          enrollmentId: enrollment.id.value,
          enrollmentCode: enrollment.code,
          fullName: catechumen.fullName,
          birthDate: catechumen.birthDate,
          level: enrollment.level,
          classSection: klass?.section,
          guardianName: catechumen.guardianAccountId
            ? guardianName.get(catechumen.guardianAccountId)
            : undefined,
          requirements,
          ready: requirements.every((item) => item.met),
          classId: klass ? klass.id.value : null,
          classLabel: klass ? classShortLabel(klass) : null,
          average: average ?? null,
          attendanceRate: rate ?? null,
          eligible: aptitude.eligible,
          reasons: aptitude.reasons,
          source,
        };
      })
      .sort(byName);
  }

  /** Candidatos de um sacramento no ano (o nível que o prepara). */
  async list(type: SacramentType, calendar?: CatecheticalCalendar): Promise<CandidateView[]> {
    const year = await this.year(calendar);
    const assessed = await this.assess(year, type, await this.candidatePairs(year, type));
    return assessed.map((item) => ({ ...item, attendanceRate: item.attendanceRate ?? undefined }));
  }

  /** A matrícula que faz do catequizando candidato (ou erro). */
  async enrollmentOf(type: SacramentType, catechumenId: string): Promise<Enrollment> {
    const year = await this.year();
    const pair = (await this.candidatePairs(year, type)).find(
      ({ catechumen }) => catechumen.id.value === catechumenId,
    );
    if (!pair) throw new SacramentCandidateNotFoundError();
    return pair.enrollment;
  }

  /** Quantos catequizandos com matrícula no ano já receberam o Batismo e a Comunhão. */
  async received(calendar: CatecheticalCalendar, centerId?: string) {
    const active = (await this.enrollments.list({ catecheticalYear: calendar.label })).filter(
      (item) =>
        ACTIVE.includes(item.status) && (!centerId || (item.centerId ?? SEDE_CENTER_ID) === centerId),
    );
    const catechumens = await this.catechumens.findByIds(active.map((item) => item.catechumenId));
    return {
      active: catechumens.length,
      received: {
        BAPTISM: catechumens.filter((item) => item.baptized).length,
        FIRST_COMMUNION: catechumens.filter((item) => item.firstCommunion).length,
      },
    };
  }
}

/** Celebrações de um sacramento no ano e os participantes de cada uma. */
export interface SacramentPlan {
  type: SacramentType;
  /** Por data. */
  celebrations: SacramentCelebration[];
  /** Por celebração. */
  participants: Map<string, ParticipantView[]>;
  /** Por celebração: quantos têm o registo dela (receberam de facto). */
  received: Map<string, number>;
  /** Candidatos do nível que prepara o sacramento (sem quem já o recebeu). */
  candidates: ParticipantView[];
}

/** Concluída (a não ser a que se está a corrigir). */
const isCompleted = (celebration: SacramentCelebration, reopen?: string) =>
  Boolean(celebration.completedAt) && celebration.id !== reopen;

/** Turmas finais da comunhão (e especiais) para um batismo com comunhão no mesmo dia. */
async function pairsForCombined(
  year: SacramentYear,
  celebration: { withCommunion?: boolean; selection: CelebrationSelection },
): Promise<Pair[]> {
  if (!celebration.withCommunion) return [];
  const classes = await year.classes();
  const manual = celebrationMode(celebration.selection) === "MANUAL";
  const selected = new Set(celebration.selection.classIds);
  const people = new Set(celebration.selection.catechumenIds);
  const received = new Set(
    (await year.records())
      .filter((item) => item.type === "FIRST_COMMUNION")
      .map((item) => item.catechumenId),
  );
  return (await year.pairs()).filter((pair) => {
    if (received.has(pair.catechumen.id.value)) return false;
    const classId = classOf(pair) ?? "";
    const klass = classes.find((item) => item.id.value === classId);
    const specialMatch =
      klass?.isSpecial &&
      (klass.sacrament === "FIRST_COMMUNION" || klass.sacrament === "BAPTISM");
    const finalYear = CANDIDATE_LEVELS.FIRST_COMMUNION.includes(pair.enrollment.level);
    if (manual) {
      return (specialMatch || finalYear) && (selected.has(classId) || people.has(pair.catechumen.id.value));
    }
    return finalYear && !klass?.isSpecial;
  });
}

/**
 * As celebrações e quem vai a cada uma:
 * - MANUAL: as turmas escolhidas (inteiras) e os catequizandos escolhidos;
 * - AUTO: os candidatos aptos que não estão numa celebração manual do mesmo
 *   sacramento, por média e presença. Com várias automáticas, repartem-se por
 *   turma inteira, equilibrando o número de pessoas pela ordem das datas;
 * - concluída: quem recebeu de facto (os restantes voltam a ser candidatos).
 */
export class SacramentCelebrations {
  constructor(
    readonly candidates: SacramentCandidates,
    private readonly sacraments: SacramentRepository,
  ) {}

  /**
   * `reopen`: uma celebração concluída tratada como marcada, com quem a
   * recebeu de volta à lista (para corrigir quem recebeu).
   */
  async plan(
    year: SacramentYear,
    type: SacramentType,
    saved?: SacramentCelebration[],
    reopen?: string,
    centerId?: string,
  ): Promise<SacramentPlan> {
    saved ??= await this.sacraments.listCelebrations(year.calendar.label);
    if (centerId) saved = saved.filter((item) => (item.centerId ?? SEDE_CENTER_ID) === centerId);
    const all = saved.filter((item) => item.type === type).sort(compareCelebrations);
    const celebrations = all.filter((item) => !isCompleted(item, reopen));
    let eligible = await this.candidates.eligiblePairs(year, type, reopen);
    if (centerId) {
      eligible = eligible.filter((pair) => (pair.enrollment.centerId ?? SEDE_CENTER_ID) === centerId);
    }
    const manual = celebrations.filter((item) => celebrationMode(item.selection) === "MANUAL");
    const chosenClasses = new Set(manual.flatMap((item) => item.selection.classIds));
    const chosenPeople = new Set(manual.flatMap((item) => item.selection.catechumenIds));
    // Só se avaliam os que podem entrar nalguma celebração.
    const yearClasses = await year.classes();
    const specialIds = new Set(
      yearClasses.filter((item) => item.isSpecial).map((item) => item.id.value),
    );
    const candidatePairs = eligible.filter((pair) => {
      const classId = classOf(pair);
      if (classId && specialIds.has(classId)) return false;
      return CANDIDATE_LEVELS[type].includes(pair.enrollment.level);
    });
    const needed = eligible.filter((pair) => {
      const classId = classOf(pair);
      if (classId && specialIds.has(classId)) {
        return chosenClasses.has(classId) || chosenPeople.has(pair.catechumen.id.value);
      }
      return (
        CANDIDATE_LEVELS[type].includes(pair.enrollment.level) ||
        chosenClasses.has(classId ?? "") ||
        chosenPeople.has(pair.catechumen.id.value)
      );
    });
    const assessed = new Map(
      (await this.candidates.assess(year, type, needed)).map((item) => [item.catechumenId, item]),
    );

    const participants = new Map<string, ParticipantView[]>();
    const taken = new Set<string>();
    for (const celebration of manual) {
      let pool = needed;
      if (celebration.withCommunion) {
        const extra = await pairsForCombined(year, celebration);
        const extraAssessed = await this.candidates.assess(year, "FIRST_COMMUNION", extra);
        for (const item of extraAssessed) assessed.set(item.catechumenId, item);
        pool = [...needed, ...extra];
      }
      const chosen = this.chosen(celebration.selection, pool, assessed).filter((item) => {
        if (item.source === "INDIVIDUAL") return true;
        const klass = yearClasses.find((entry) => entry.id.value === item.classId);
        return Boolean(klass?.isSpecial) || item.eligible;
      });
      chosen.forEach((item) => taken.add(item.catechumenId));
      participants.set(celebration.id, chosen.sort(byName));
    }

    const candidates = candidatePairs.flatMap(
      (pair) => assessed.get(pair.catechumen.id.value) ?? [],
    );
    const suggested = candidates
      .filter((item) => item.eligible && !taken.has(item.catechumenId))
      .sort(bySuggestion);
    const auto = celebrations.filter((item) => celebrationMode(item.selection) === "AUTO");
    const centerOfPerson = new Map(
      candidatePairs.map((pair) => [
        pair.catechumen.id.value,
        pair.enrollment.centerId ?? SEDE_CENTER_ID,
      ]),
    );
    const autoCenters = [...new Set(auto.map((item) => item.centerId ?? SEDE_CENTER_ID))];
    for (const center of autoCenters) {
      const autoHere = auto.filter((item) => (item.centerId ?? SEDE_CENTER_ID) === center);
      const suggestedHere = suggested.filter(
        (item) => (centerOfPerson.get(item.catechumenId) ?? SEDE_CENTER_ID) === center,
      );
      const groups = new Map<string, ParticipantView[]>();
      for (const item of suggestedHere) {
        const key = item.classLabel ?? "";
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }
      const buckets = distributeGroups(
        [...groups.entries()].map(([key, items]) => ({ key, items })),
        autoHere.length,
      );
      autoHere.forEach((celebration, index) => {
        participants.set(
          celebration.id,
          buckets[index]
            .map((item) => ({ ...item, source: "SUGGESTED" as const }))
            .sort(bySuggestion),
        );
      });
      const combined = autoHere.filter((item) => item.withCommunion);
      if (combined.length) {
        const pairs = (await pairsForCombined(year, {
          withCommunion: true,
          selection: { classIds: [], catechumenIds: [] },
        })).filter((pair) => (pair.enrollment.centerId ?? SEDE_CENTER_ID) === center);
        const extra = await this.candidates.assess(year, "FIRST_COMMUNION", pairs);
        const target = combined[0];
        const current = participants.get(target.id) ?? [];
        const ids = new Set(current.map((item) => item.catechumenId));
        const added = extra
          .filter((item) => item.eligible && !taken.has(item.catechumenId) && !ids.has(item.catechumenId))
          .map((item) => ({ ...item, source: "SUGGESTED" as const }));
        added.forEach((item) => taken.add(item.catechumenId));
        participants.set(target.id, [...current, ...added].sort(bySuggestion));
      }
    }

    // Concluídas: quem tem o registo de cada uma.
    const records = (await year.records()).filter((item) => item.type === type);
    const received = new Map<string, number>();
    for (const record of records) {
      if (record.celebrationId) {
        received.set(record.celebrationId, (received.get(record.celebrationId) ?? 0) + 1);
      }
    }
    const completed = all.filter((item) => isCompleted(item, reopen));
    if (completed.length) {
      const pairs = await year.pairs();
      const recipients = (celebration: SacramentCelebration) => {
        const ids = new Set(
          records
            .filter((item) => item.celebrationId === celebration.id)
            .map((r) => r.catechumenId),
        );
        return pairs.filter((pair) => ids.has(pair.catechumen.id.value));
      };
      const assessedRecipients = new Map(
        (await this.candidates.assess(year, type, completed.flatMap(recipients))).map((item) => [
          item.catechumenId,
          item,
        ]),
      );
      for (const celebration of completed) {
        const classes = new Set(celebration.selection.classIds);
        const people = new Set(celebration.selection.catechumenIds);
        participants.set(
          celebration.id,
          recipients(celebration).flatMap((pair): ParticipantView[] => {
            const item = assessedRecipients.get(pair.catechumen.id.value);
            if (!item) return [];
            const source: ParticipantSource = classes.has(classOf(pair) ?? "")
              ? "CLASS"
              : people.has(item.catechumenId)
                ? "INDIVIDUAL"
                : "SUGGESTED";
            return [{ ...item, source }];
          }),
        );
      }
    }

    return {
      type,
      celebrations: all,
      participants,
      received,
      candidates: candidates.sort(byName),
    };
  }

  /** Os escolhidos à mão: turmas inteiras e catequizandos um a um. */
  private chosen(
    selection: CelebrationSelection,
    pairs: Pair[],
    assessed: Map<string, ParticipantView>,
  ): ParticipantView[] {
    const classes = new Set(selection.classIds);
    const people = new Set(selection.catechumenIds);
    return pairs.flatMap((pair): ParticipantView[] => {
      const item = assessed.get(pair.catechumen.id.value);
      if (!item) return [];
      if (classes.has(classOf(pair) ?? "")) return [{ ...item, source: "CLASS" }];
      if (people.has(pair.catechumen.id.value)) return [{ ...item, source: "INDIVIDUAL" }];
      return [];
    });
  }

  toView(
    celebration: SacramentCelebration,
    participants: ParticipantView[],
    receivedCount: number,
  ): CelebrationView {
    return {
      id: celebration.id,
      type: celebration.type,
      date: celebration.date,
      time: celebration.time ?? null,
      place: celebration.place,
      notes: celebration.notes ?? null,
      mode: celebrationMode(celebration.selection),
      withCommunion: celebration.withCommunion === true,
      selection: {
        classIds: [...celebration.selection.classIds],
        catechumenIds: [...celebration.selection.catechumenIds],
      },
      participants: participants.length,
      ready: participants.filter((item) => item.ready).length,
      status: celebration.completedAt ? "COMPLETED" : "SCHEDULED",
      completedAt: celebration.completedAt?.toISOString() ?? null,
      receivedCount,
      center: centerRef(celebration.centerId ?? SEDE_CENTER_ID),
      createdAt: celebration.createdAt.toISOString(),
      updatedAt: celebration.updatedAt.toISOString(),
    };
  }

  /** A vista de uma celebração a partir do plano do seu sacramento. */
  fromPlan(plan: SacramentPlan, celebration: SacramentCelebration): CelebrationView {
    return this.toView(
      celebration,
      plan.participants.get(celebration.id) ?? [],
      plan.received.get(celebration.id) ?? 0,
    );
  }

  /** A celebração do ano em curso (ou erro). */
  async find(id: string, year: SacramentYear): Promise<SacramentCelebration> {
    const celebration = await this.sacraments.findCelebration(id);
    if (!celebration || celebration.catecheticalYear !== year.calendar.label) {
      throw new CelebrationNotFoundError();
    }
    return celebration;
  }

  /** A vista de uma celebração já gravada (com os participantes atuais). */
  async view(year: SacramentYear, celebration: SacramentCelebration): Promise<CelebrationView> {
    const plan = await this.plan(year, celebration.type);
    return this.fromPlan(plan, celebration);
  }
}

/** Celebrações do ano e, por sacramento, os candidatos e quantos já têm celebração. */
export class GetSacramentsOverviewUseCase {
  constructor(private readonly celebrations: SacramentCelebrations) {}

  async execute({ centerId }: { centerId?: string } = {}): Promise<SacramentsOverviewView> {
    const candidates = this.celebrations.candidates;
    const calendar = await candidates.calendar();
    const year = await candidates.year(calendar);
    const [plans, received] = await Promise.all([
      Promise.all(SACRAMENT_TYPES.map((type) => this.celebrations.plan(year, type, undefined, undefined, centerId))),
      candidates.received(calendar, centerId),
    ]);
    const views = plans
      .flatMap((plan) => plan.celebrations.map((celebration) => ({ celebration, plan })))
      .sort((a, b) => compareCelebrations(a.celebration, b.celebration))
      .map(({ celebration, plan }) => this.celebrations.fromPlan(plan, celebration));
    return {
      catecheticalYear: calendar.label,
      celebrations: views,
      types: plans.map((plan) => {
        const assigned = new Set(
          [...plan.participants.values()].flat().map((item) => item.catechumenId),
        );
        const inSome = plan.candidates.filter((item) => assigned.has(item.catechumenId)).length;
        return {
          type: plan.type,
          level: CANDIDATE_LEVEL[plan.type],
          candidates: plan.candidates.length,
          ready: plan.candidates.filter((item) => item.ready).length,
          assigned: inSome,
          unassigned: plan.candidates.length - inSome,
        };
      }),
      ...received,
    };
  }
}

/** Candidatos de um sacramento, com pesquisa e filtro pela preparação. */
export class ListSacramentCandidatesUseCase {
  constructor(private readonly candidates: SacramentCandidates) {}

  async execute(query: { type: SacramentType; search?: string; filter?: CandidateFilter }) {
    const all = await this.candidates.list(query.type);
    return {
      items: filterPeople(all, query),
      counts: {
        ALL: all.length,
        READY: all.filter((item) => item.ready).length,
        PENDING: all.filter((item) => !item.ready).length,
      } satisfies Record<CandidateFilter, number>,
    };
  }
}

function filterPeople<T extends { ready: boolean; fullName: string; guardianName?: string }>(
  items: T[],
  query: { search?: string; filter?: CandidateFilter },
): T[] {
  const search = normalize(query.search?.trim() ?? "");
  const filter = query.filter ?? "ALL";
  return items.filter(
    (item) =>
      (filter === "ALL" || item.ready === (filter === "READY")) &&
      (!search || normalize(`${item.fullName} ${item.guardianName ?? ""}`).includes(search)),
  );
}

/** A coordenação marca um requisito entregue (ou desmarca). */
export class SetSacramentRequirementUseCase {
  constructor(
    private readonly candidates: SacramentCandidates,
    private readonly sacraments: SacramentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorId: string;
    type: SacramentType;
    catechumenId: string;
    requirement: SacramentRequirement;
    met: boolean;
  }) {
    if (!isCheckable(input.type, input.requirement))
      throw new InvalidSacramentError(
        `"${REQUIREMENT_LABEL[input.requirement]}" não se marca aqui para ${SACRAMENT_LABEL[input.type]}.`,
      );
    await this.candidates.enrollmentOf(input.type, input.catechumenId);
    await this.sacraments.saveCheck({
      catechumenId: input.catechumenId,
      sacrament: input.type,
      requirement: input.requirement as CheckableRequirement,
      met: input.met,
      updatedAt: this.clock.now(),
      updatedBy: input.actorId,
    });
    const [catechumen] = await this.catechumens.findByIds([input.catechumenId]);
    await this.activity.record({
      actorId: input.actorId,
      category: "ENROLLMENT",
      action: "catechesis.sacrament_requirement_set",
      summary: `${SACRAMENT_LABEL[input.type]} de ${catechumen?.fullName ?? "catequizando"}: ${input.met ? "marcou" : "desmarcou"} "${REQUIREMENT_LABEL[input.requirement]}"`,
    });
    const candidate = (await this.candidates.list(input.type)).find(
      (item) => item.catechumenId === input.catechumenId,
    );
    return candidate!;
  }
}

export interface CelebrationInput {
  date: string;
  time?: string | null;
  place: string;
  notes?: string | null;
  selection: CelebrationSelection;
  withCommunion?: boolean;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A hora, o local e as notas (o que uma celebração concluída ainda deixa mudar). */
function cleanDetails(input: Pick<CelebrationInput, "time" | "place" | "notes">) {
  const time = input.time?.trim() || undefined;
  if (time && !TIME.test(time))
    throw new InvalidCelebrationError("A hora escreve-se assim: 10:00.");
  const place = input.place.trim();
  if (place.length < 3 || place.length > 120) {
    throw new InvalidCelebrationError("Indique o local (de 3 a 120 caracteres).");
  }
  const notes = input.notes?.trim() || undefined;
  if (notes && notes.length > 500) {
    throw new InvalidCelebrationError("As notas podem ter no máximo 500 caracteres.");
  }
  return { time, place, notes };
}

/** A mesma seleção (sem contar a ordem nem repetidos). */
const sameSelection = (a: CelebrationSelection, b: CelebrationSelection) => {
  const key = (selection: CelebrationSelection) =>
    JSON.stringify([
      [...new Set(selection.classIds)].sort(),
      [...new Set(selection.catechumenIds)].sort(),
    ]);
  return key(a) === key(b);
};

/** Valida os dados e a seleção; devolve-os limpos. */
async function cleanCelebration(
  input: CelebrationInput,
  type: SacramentType,
  year: SacramentYear,
  centerId?: string,
): Promise<Omit<CelebrationInput, "time" | "notes"> & { time?: string; notes?: string }> {
  const { calendar } = year;
  const latest = addMonths(calendar.endsOn, MONTHS_AFTER_YEAR);
  if (!isIsoDate(input.date) || input.date < calendar.startsOn || input.date > latest) {
    throw new InvalidCelebrationError(
      `A data tem de ser no ano catequético (de ${formatDate(calendar.startsOn)} a ${formatDate(latest)}).`,
    );
  }
  const { time, place, notes } = cleanDetails(input);
  const withCommunion = type === "BAPTISM" && input.withCommunion === true;

  const classIds = [...new Set(input.selection.classIds)].sort();
  const catechumenIds = [...new Set(input.selection.catechumenIds)].sort();
  const yearClasses = await year.classes();
  const classes = new Map(yearClasses.map((item) => [item.id.value, item]));
  if (classIds.some((id) => !classes.has(id))) {
    throw new InvalidCelebrationError("Há turmas escolhidas que não são do ano em curso.");
  }
  if (
    classIds.some((id) => {
      const klass = classes.get(id)!;
      const specialMatch =
        klass.isSpecial &&
        klass.sacrament !== undefined &&
        selectionSacramentTypes(type, withCommunion).includes(klass.sacrament);
      return !specialMatch && !isCandidateLevel(type, klass.level, withCommunion);
    })
  ) {
    throw new InvalidCelebrationError("Há turmas que não preparam este sacramento.");
  }
  const pairs = new Map((await year.pairs()).map((pair) => [pair.catechumen.id.value, pair]));
  if (catechumenIds.some((id) => !pairs.has(id))) {
    throw new InvalidCelebrationError(
      "Há catequizandos escolhidos sem matrícula aceite no ano em curso.",
    );
  }
  if (centerId) {
    const otherClass = classIds.some(
      (id) => (classes.get(id)?.centerId ?? SEDE_CENTER_ID) !== centerId,
    );
    const otherPerson = catechumenIds.some(
      (id) => (pairs.get(id)?.enrollment.centerId ?? SEDE_CENTER_ID) !== centerId,
    );
    if (otherClass || otherPerson) throw new CenterForbiddenError();
  }
  const recorded = new Set(
    (await year.records()).filter((item) => item.type === type).map((item) => item.catechumenId),
  );
  const received = catechumenIds.flatMap((id) =>
    recorded.has(id) ? [pairs.get(id)!.catechumen.fullName] : [],
  );
  if (received.length) {
    throw new InvalidCelebrationError(
      `${received.join(", ")} já ${received.length === 1 ? "tem" : "têm"} ${THE_SACRAMENT[type]} registad${type === "FIRST_COMMUNION" ? "a" : "o"}.`,
    );
  }
  return {
    date: input.date,
    time,
    place,
    notes,
    withCommunion,
    selection: { classIds, catechumenIds },
  };
}

/** Quem a seleção desta celebração já tem noutra celebração manual do mesmo sacramento. */
async function conflictsOf(
  service: SacramentCelebrations,
  year: SacramentYear,
  celebration: SacramentCelebration,
  saved: SacramentCelebration[],
): Promise<ParticipantConflict[]> {
  if (celebrationMode(celebration.selection) === "AUTO") return [];
  const others = saved.filter((item) => item.id !== celebration.id);
  const plan = await service.plan(year, celebration.type, [...others, celebration]);
  const mine = plan.participants.get(celebration.id) ?? [];
  const conflicts: ParticipantConflict[] = [];
  for (const other of plan.celebrations) {
    if (
      other.id === celebration.id ||
      other.completedAt ||
      celebrationMode(other.selection) === "AUTO"
    )
      continue;
    const theirs = new Set(
      (plan.participants.get(other.id) ?? []).map((item) => item.catechumenId),
    );
    for (const person of mine) {
      if (
        theirs.has(person.catechumenId) &&
        !conflicts.some((c) => c.catechumenId === person.catechumenId)
      ) {
        conflicts.push({
          catechumenId: person.catechumenId,
          fullName: person.fullName,
          celebrationId: other.id,
          date: other.date,
        });
      }
    }
  }
  return conflicts.sort(byName);
}

const OF_THE: Record<SacramentType, string> = {
  BAPTISM: "do",
  FIRST_COMMUNION: "da",
  CONFIRMATION: "do",
};

const THE_SACRAMENT: Record<SacramentType, string> = {
  BAPTISM: "o Batismo",
  FIRST_COMMUNION: "a Primeira Comunhão",
  CONFIRMATION: "o Crisma",
};

/** "da Primeira Comunhão de 30/05/2027 (Igreja Cristo Rei da Paz)" */
const summaryOf = (celebration: Pick<SacramentCelebration, "type" | "date" | "place">) =>
  `${OF_THE[celebration.type]} ${SACRAMENT_LABEL[celebration.type]} de ${formatDate(celebration.date)} (${celebration.place})`;

/** Marca uma celebração nova (participantes escolhidos ou sugeridos). */
export class CreateCelebrationUseCase {
  constructor(
    private readonly celebrations: SacramentCelebrations,
    private readonly sacraments: SacramentRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly centers?: CenterRepository,
  ) {}

  async execute(
    input: CelebrationInput & {
      actorId: string;
      type: SacramentType;
      centerId?: string;
      scope?: CenterScope;
    },
  ): Promise<CelebrationView> {
    const year = await this.celebrations.candidates.year();
    const centerId = await resolveWriteCenter(this.centers, input.scope, input.centerId);
    const clean = await cleanCelebration(input, input.type, year, centerId);
    const now = this.clock.now();
    const celebration: SacramentCelebration = {
      id: UniqueId.create().value,
      catecheticalYear: year.calendar.label,
      type: input.type,
      centerId,
      ...clean,
      createdAt: now,
      createdBy: input.actorId,
      updatedAt: now,
      updatedBy: input.actorId,
    };
    const saved = await this.sacraments.listCelebrations(year.calendar.label);
    const conflicts = await conflictsOf(this.celebrations, year, celebration, saved);
    if (conflicts.length) throw new ParticipantConflictError(conflicts);
    await this.sacraments.saveCelebration(celebration);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.sacrament_celebration_created",
      summary: `Marcou a celebração ${summaryOf(celebration)}`,
    });
    return this.celebrations.view(year, celebration);
  }
}

/** Altera uma celebração (o sacramento não muda). */
export class UpdateCelebrationUseCase {
  constructor(
    private readonly celebrations: SacramentCelebrations,
    private readonly sacraments: SacramentRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CelebrationInput & { actorId: string; id: string; scope?: CenterScope },
  ): Promise<CelebrationView> {
    const year = await this.celebrations.candidates.year();
    const current = await this.celebrations.find(input.id, year);
    assertSameCenter(input.scope, current.centerId ?? SEDE_CENTER_ID);
    if (current.completedAt) {
      // Concluída: já não muda a data nem quem foi (só a hora, o local e as notas).
      if (input.date !== current.date || !sameSelection(input.selection, current.selection)) {
        throw new InvalidCelebrationError(
          "Esta celebração já foi concluída: só pode alterar a hora, o local e as notas.",
        );
      }
      const celebration: SacramentCelebration = {
        ...current,
        ...cleanDetails(input),
        updatedAt: this.clock.now(),
        updatedBy: input.actorId,
      };
      await this.sacraments.saveCelebration(celebration);
      await this.activity.record({
        actorId: input.actorId,
        category: "SETTINGS",
        action: "catechesis.sacrament_celebration_updated",
        summary: `Alterou a celebração ${summaryOf(celebration)}`,
      });
      return this.celebrations.view(year, celebration);
    }
    const clean = await cleanCelebration(
      input,
      current.type,
      year,
      current.centerId ?? SEDE_CENTER_ID,
    );
    const celebration: SacramentCelebration = {
      ...current,
      ...clean,
      updatedAt: this.clock.now(),
      updatedBy: input.actorId,
    };
    const saved = await this.sacraments.listCelebrations(year.calendar.label);
    const conflicts = await conflictsOf(this.celebrations, year, celebration, saved);
    if (conflicts.length) throw new ParticipantConflictError(conflicts);
    await this.sacraments.saveCelebration(celebration);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.sacrament_celebration_updated",
      summary: `Alterou a celebração ${summaryOf(celebration)}`,
    });
    return this.celebrations.view(year, celebration);
  }
}

/** Apaga uma celebração (os participantes ficam sem celebração ou voltam às sugestões). */
export class DeleteCelebrationUseCase {
  constructor(
    private readonly celebrations: SacramentCelebrations,
    private readonly sacraments: SacramentRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: { actorId: string; id: string; scope?: CenterScope }): Promise<void> {
    const year = await this.celebrations.candidates.year();
    const celebration = await this.celebrations.find(input.id, year);
    assertSameCenter(input.scope, celebration.centerId ?? SEDE_CENTER_ID);
    if (celebration.completedAt) {
      throw new InvalidCelebrationError(
        "Esta celebração já foi concluída e tem os sacramentos registados: não pode ser apagada.",
      );
    }
    await this.sacraments.deleteCelebration(celebration.id);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.sacrament_celebration_deleted",
      summary: `Apagou a celebração ${summaryOf(celebration)}`,
    });
  }
}

/** Participantes de uma celebração, com pesquisa e filtro pela preparação. */
export class ListCelebrationParticipantsUseCase {
  constructor(private readonly celebrations: SacramentCelebrations) {}

  async execute(query: {
    id: string;
    search?: string;
    filter?: CandidateFilter;
    scope?: CenterScope;
  }): Promise<{ items: ParticipantView[] }> {
    const year = await this.celebrations.candidates.year();
    const celebration = await this.celebrations.find(query.id, year);
    assertSameCenter(query.scope, celebration.centerId ?? SEDE_CENTER_ID);
    const plan = await this.celebrations.plan(year, celebration.type);
    return { items: filterPeople(plan.participants.get(celebration.id) ?? [], query) };
  }
}

/** Turmas do ano para escolher (as do nível que prepara o sacramento primeiro). */
export class ListSelectableClassesUseCase {
  constructor(private readonly celebrations: SacramentCelebrations) {}

  async execute({
    type,
    centerId,
    withCommunion = false,
  }: {
    type: SacramentType;
    centerId?: string;
    withCommunion?: boolean;
  }): Promise<{ items: SelectableClassView[] }> {
    const candidates = this.celebrations.candidates;
    const year = await candidates.year();
    const [classes, pairs, plan] = await Promise.all([
      year.classes(),
      year.pairs(),
      this.celebrations.plan(year, type),
    ]);
    const eligiblePairs = await candidates.eligiblePairs(year, type);
    const assessed = await candidates.assess(
      year,
      type,
      eligiblePairs.filter((pair) => classOf(pair) !== null),
    );
    const communionEligible = new Map<string, number>();
    if (type === "BAPTISM" && withCommunion) {
      const communionPairs = (await candidates.eligiblePairs(year, "FIRST_COMMUNION")).filter(
        (pair) => {
          const classId = classOf(pair);
          const klass = classes.find((item) => item.id.value === classId);
          return (
            klass !== undefined &&
            (CANDIDATE_LEVELS.FIRST_COMMUNION.includes(klass.level) ||
              (klass.isSpecial && klass.sacrament === "FIRST_COMMUNION"))
          );
        },
      );
      const extra = await candidates.assess(year, "FIRST_COMMUNION", communionPairs);
      for (const item of extra) {
        if (!item.eligible || !item.classId) continue;
        communionEligible.set(item.classId, (communionEligible.get(item.classId) ?? 0) + 1);
      }
    }
    const items = classes
      .filter((klass) => matchesCenter(klass.centerId, centerId))
      .filter((klass) => {
        if (klass.isSpecial) {
          return (
            klass.sacrament !== undefined &&
            selectionSacramentTypes(type, withCommunion).includes(klass.sacrament)
          );
        }
        return isCandidateLevel(type, klass.level, withCommunion);
      })
      .map((klass): SelectableClassView => {
      const id = klass.id.value;
      // Uma concluída já não prende a turma (quem não recebeu pode ir a outra).
      const taken = plan.celebrations.find(
        (item) => !item.completedAt && item.selection.classIds.includes(id),
      );
      return {
        id,
        label: classShortLabel(klass),
        level: klass.level,
        members: pairs.filter((pair) => classOf(pair) === id).length,
        eligible:
          communionEligible.get(id) ??
          assessed.filter((item) => item.classId === id && item.eligible).length,
        isCandidateLevel: !klass.isSpecial && isCandidateLevel(type, klass.level, withCommunion),
        special: klass.isSpecial,
        sacrament: klass.sacrament ?? null,
        audience: klass.audience ?? null,
        takenBy: taken ? { celebrationId: taken.id, date: taken.date } : null,
      };
    });
    return {
      items: items
        .filter((item) => item.special || item.members > 0)
        .sort(
          (a, b) =>
            Number(b.special) - Number(a.special) ||
            Number(b.isCandidateLevel) - Number(a.isCandidateLevel) ||
            LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
            a.label.localeCompare(b.label, "pt"),
        ),
    };
  }
}

/** Catequizandos de uma turma avaliados para um sacramento (para escolher alguns). */
export class ListClassMembersForSacramentUseCase {
  constructor(private readonly celebrations: SacramentCelebrations) {}

  async execute(query: {
    classId: string;
    type: SacramentType;
    withCommunion?: boolean;
    scope?: CenterScope;
  }): Promise<{ items: ParticipantView[] }> {
    const candidates = this.celebrations.candidates;
    const year = await candidates.year();
    const klass = (await year.classes()).find((item) => item.id.value === query.classId);
    if (!klass) throw new ClassNotFoundError();
    assertSameCenter(query.scope, klass.centerId);
    const communionTrack =
      query.type === "BAPTISM" &&
      query.withCommunion === true &&
      (CANDIDATE_LEVELS.FIRST_COMMUNION.includes(klass.level) ||
        klass.sacrament === "FIRST_COMMUNION");
    const assessType = communionTrack ? "FIRST_COMMUNION" : query.type;
    const members = (await candidates.eligiblePairs(year, assessType)).filter(
      (pair) => classOf(pair) === query.classId,
    );
    const items = await candidates.assess(year, assessType, members, "INDIVIDUAL");
    return { items: klass.isSpecial ? items : items.filter((item) => item.eligible) };
  }
}
