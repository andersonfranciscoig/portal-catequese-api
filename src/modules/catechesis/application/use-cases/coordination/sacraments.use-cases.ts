import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import type { CatechesisLevel, EnrollmentStatus } from "../../../domain/catechesis.js";
import { attendanceTotals } from "../../../domain/class-attendance.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import {
  CalendarNotDefinedError,
  InvalidSacramentError,
  SacramentCandidateNotFoundError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
  SacramentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import {
  CANDIDATE_LEVEL,
  easterVigil,
  isCheckable,
  requirementStates,
  SACRAMENT_TYPES,
  type CheckableRequirement,
  type RequirementState,
  type SacramentRequirement,
  type SacramentType,
} from "../../../domain/sacraments.js";

/** Local por omissão das celebrações. */
export const PARISH_CHURCH = "Igreja Cristo Rei da Paz";

const SACRAMENT_LABEL: Record<SacramentType, string> = {
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

/** Matrículas aceites pela coordenação: quem conta como candidato. */
const ACCEPTED: EnrollmentStatus[] = ["APPROVED", "PENDING_CONFIRMATION", "CONFIRMED"];

/** Matrículas em curso no ano (para os sacramentos já recebidos). */
const ACTIVE: EnrollmentStatus[] = [...ACCEPTED, "SUBMITTED", "UNDER_REVIEW", "WAITLIST"];

export interface CelebrationView {
  type: SacramentType;
  /** YYYY-MM-DD; vazio enquanto a coordenação não a marcar. */
  date?: string;
  place: string;
  /** Data e local definidos pela coordenação (não os por omissão). */
  scheduled: boolean;
  level: CatechesisLevel;
  candidates: number;
  ready: number;
}

export interface SacramentsOverviewView {
  catecheticalYear: string;
  celebrations: CelebrationView[];
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
  level: CatechesisLevel;
  classSection?: string;
  guardianName?: string;
  /** Frequência no ano (só encontros com chamada lançada). */
  attendanceRate?: number;
  requirements: RequirementState[];
  ready: boolean;
}

export type CandidateFilter = "ALL" | "READY" | "PENDING";

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Candidatos de cada celebração do ano e o estado dos requisitos. */
export class SacramentCandidates {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly attendance: AttendanceRepository,
    private readonly documents: EnrollmentDocumentRepository,
    private readonly sacraments: SacramentRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async calendar(): Promise<CatecheticalCalendar> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    return calendar;
  }

  async celebrations(calendar: CatecheticalCalendar) {
    const saved = await this.sacraments.listCelebrations(calendar.label);
    return SACRAMENT_TYPES.map((type) => {
      const celebration = saved.find((item) => item.type === type);
      if (celebration)
        return { type, date: celebration.date, place: celebration.place, scheduled: true };
      // O Batismo é na Vigília Pascal; as outras datas marca-as a coordenação.
      const date = type === "BAPTISM" ? easterVigil(Number(calendar.label.slice(5, 9))) : undefined;
      return { type, date, place: PARISH_CHURCH, scheduled: false };
    });
  }

  /** Matrículas do ano que fazem de alguém candidato ao sacramento. */
  private async candidateEnrollments(calendar: CatecheticalCalendar, type: SacramentType) {
    const enrollments = (await this.enrollments.list({ catecheticalYear: calendar.label })).filter(
      (item) => item.level === CANDIDATE_LEVEL[type] && ACCEPTED.includes(item.status),
    );
    const catechumens = await this.catechumens.findByIds(
      enrollments.map((item) => item.catechumenId),
    );
    const byId = new Map(catechumens.map((item) => [item.id.value, item]));
    return enrollments.flatMap((enrollment) => {
      const catechumen = byId.get(enrollment.catechumenId);
      // Quem já foi batizado não volta a ser candidato ao Batismo.
      if (!catechumen || (type === "BAPTISM" && catechumen.baptized)) return [];
      return [{ enrollment, catechumen }];
    });
  }

  async list(type: SacramentType, calendar?: CatecheticalCalendar): Promise<CandidateView[]> {
    calendar ??= await this.calendar();
    const pairs = await this.candidateEnrollments(calendar, type);
    if (!pairs.length) return [];
    const enrollmentIds = pairs.map(({ enrollment }) => enrollment.id.value);
    const catechumenIds = pairs.map(({ catechumen }) => catechumen.id.value);
    const classIds = [
      ...new Set(
        pairs.flatMap(({ enrollment }) =>
          enrollment.isConfirmed && enrollment.classId ? [enrollment.classId] : [],
        ),
      ),
    ];
    const [documents, checks, classes, rolls, guardians] = await Promise.all([
      this.documents.listForEnrollments(enrollmentIds),
      this.sacraments.listChecks(catechumenIds, type),
      this.classes.findByIds(classIds),
      Promise.all(classIds.map((id) => this.attendance.listForClass(id))),
      this.people.findMany(
        pairs.flatMap(({ catechumen }) =>
          catechumen.guardianAccountId ? [catechumen.guardianAccountId] : [],
        ),
      ),
    ]);
    const marks = rolls.flat();
    const guardianName = new Map(guardians.map((person) => [person.id, person.fullName]));

    return pairs
      .map(({ enrollment, catechumen }) => {
        const id = catechumen.id.value;
        const classId = enrollment.isConfirmed ? enrollment.classId : undefined;
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
        return {
          catechumenId: id,
          enrollmentId: enrollment.id.value,
          enrollmentCode: enrollment.code,
          fullName: catechumen.fullName,
          birthDate: catechumen.birthDate,
          level: enrollment.level,
          classSection: classes.find((item) => item.id.value === classId)?.section,
          guardianName: catechumen.guardianAccountId
            ? guardianName.get(catechumen.guardianAccountId)
            : undefined,
          attendanceRate: attendanceTotals(entries).rate,
          requirements,
          ready: requirements.every((item) => item.met),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
  }

  /** A matrícula que faz do catequizando candidato (ou erro). */
  async enrollmentOf(type: SacramentType, catechumenId: string): Promise<Enrollment> {
    const pair = (await this.candidateEnrollments(await this.calendar(), type)).find(
      ({ catechumen }) => catechumen.id.value === catechumenId,
    );
    if (!pair) throw new SacramentCandidateNotFoundError();
    return pair.enrollment;
  }

  /** Quantos catequizandos com matrícula no ano já receberam o Batismo e a Comunhão. */
  async received(calendar: CatecheticalCalendar) {
    const active = (await this.enrollments.list({ catecheticalYear: calendar.label })).filter(
      (item) => ACTIVE.includes(item.status),
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

/** Celebrações do ano, com os candidatos prontos de cada uma. */
export class GetSacramentsOverviewUseCase {
  constructor(private readonly candidates: SacramentCandidates) {}

  async execute(): Promise<SacramentsOverviewView> {
    const calendar = await this.candidates.calendar();
    const [celebrations, lists, received] = await Promise.all([
      this.candidates.celebrations(calendar),
      Promise.all(SACRAMENT_TYPES.map((type) => this.candidates.list(type, calendar))),
      this.candidates.received(calendar),
    ]);
    return {
      catecheticalYear: calendar.label,
      celebrations: celebrations.map((celebration, index) => ({
        ...celebration,
        level: CANDIDATE_LEVEL[celebration.type],
        candidates: lists[index].length,
        ready: lists[index].filter((item) => item.ready).length,
      })),
      ...received,
    };
  }
}

/** Candidatos de uma celebração, com pesquisa e filtro pela preparação. */
export class ListSacramentCandidatesUseCase {
  constructor(private readonly candidates: SacramentCandidates) {}

  async execute(query: { type: SacramentType; search?: string; filter?: CandidateFilter }) {
    const all = await this.candidates.list(query.type);
    const search = normalize(query.search?.trim() ?? "");
    const filter = query.filter ?? "ALL";
    return {
      items: all.filter(
        (item) =>
          (filter === "ALL" || item.ready === (filter === "READY")) &&
          (!search || normalize(`${item.fullName} ${item.guardianName ?? ""}`).includes(search)),
      ),
      counts: {
        ALL: all.length,
        READY: all.filter((item) => item.ready).length,
        PENDING: all.filter((item) => !item.ready).length,
      } satisfies Record<CandidateFilter, number>,
    };
  }
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

/** Data e local de uma celebração do ano; `null` volta aos por omissão. */
export class SetCelebrationUseCase {
  constructor(
    private readonly candidates: SacramentCandidates,
    private readonly sacraments: SacramentRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorId: string;
    type: SacramentType;
    celebration: { date: string; place: string } | null;
  }) {
    const calendar = await this.candidates.calendar();
    const label = SACRAMENT_LABEL[input.type];
    if (input.celebration) {
      const { date, place } = input.celebration;
      if (date < calendar.startsOn || date > calendar.endsOn)
        throw new InvalidSacramentError(
          `A data tem de ficar dentro do ano catequético (${calendar.startsOn} a ${calendar.endsOn}).`,
        );
      await this.sacraments.saveCelebration({
        catecheticalYear: calendar.label,
        type: input.type,
        date,
        place: place.trim(),
        updatedAt: this.clock.now(),
        updatedBy: input.actorId,
      });
    } else {
      await this.sacraments.deleteCelebration(calendar.label, input.type);
    }
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.sacrament_celebration_set",
      summary: input.celebration
        ? `Marcou ${label} para ${input.celebration.date.split("-").reverse().join("/")} (${input.celebration.place.trim()})`
        : `Retirou a data da ${label}`,
    });
    return (await this.candidates.celebrations(calendar)).find((item) => item.type === input.type)!;
  }
}
