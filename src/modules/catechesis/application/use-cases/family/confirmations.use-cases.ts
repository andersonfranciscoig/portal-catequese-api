import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { EventBus } from "../../../../../shared/application/event-bus.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import {
  formatLevel,
  nextLevel,
  previousYearLabel,
  slotRequirement,
  suggestSlot,
  type CatechesisLevel,
  type EnrollmentStatus,
  type SessionSlot,
  type YearOutcome,
} from "../../../domain/catechesis.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import { attendanceTotals } from "../../../domain/class-attendance.js";
import { ageAt, luandaToday } from "../../../domain/dates.js";
import { Enrollment } from "../../../domain/enrollment.js";
import {
  CalendarNotDefinedError,
  ConfirmationNotAllowedError,
  EnrollmentNotFoundError,
} from "../../../domain/errors/catechesis.errors.js";
import { averageGrade, suggestOutcome } from "../../../domain/evaluation.js";
import { EnrollmentSubmitted } from "../../../domain/events/enrollment-submitted.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
  EvaluationRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechesisAccess } from "../../catechesis-access.js";
import type { EnrollmentCodes } from "../../enrollment-codes.js";

/** O ano concluído de um catequizando (base da confirmação). */
export interface AnnualRecordView {
  enrollmentId: string;
  code: string;
  catecheticalYear: string;
  catechumenId: string;
  catechumen: { fullName: string; birthDate: string };
  level: CatechesisLevel;
  section: string;
  catechistName: string;
  slot: SessionSlot;
  /** Percentagem de presenças (0–100). */
  attendanceRate: number;
  /** A decisão do catequista; sem ela, a sugestão (média e presença). */
  outcome: YearOutcome;
}

export type ConfirmationCandidateView =
  | {
      kind: "eligible";
      record: AnnualRecordView;
      nextLevel: CatechesisLevel;
      age: number;
      defaultSlot: SessionSlot;
    }
  | { kind: "already-confirmed"; record: AnnualRecordView; confirmedCode: string }
  | { kind: "completed"; record: AnnualRecordView };

export interface ConfirmationReceiptView {
  id: string;
  code: string;
  previousCode: string;
  catechumenName: string;
  level: CatechesisLevel;
  slot: SessionSlot;
  status: EnrollmentStatus;
  catecheticalYear: string;
  confirmedAt: string;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Avalia os anos concluídos (matrículas confirmadas do ano anterior): pode
 * confirmar, já confirmou ou terminou o percurso. Partilhado pela família e
 * pela coordenação.
 */
export class ConfirmationCandidates {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly attendance: AttendanceRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async forCatechumens(catechumens: Catechumen[]): Promise<ConfirmationCandidateView[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const previousYear = previousYearLabel(calendar.label);
    const byId = new Map(catechumens.map((item) => [item.id.value, item]));
    const all = await this.enrollments.listForCatechumens([...byId.keys()]);
    const previous = all.filter(
      (item) => item.catecheticalYear === previousYear && item.isConfirmed && item.classId,
    );
    const current = new Map(
      all
        .filter((item) => item.catecheticalYear === calendar.label)
        .map((item) => [item.catechumenId, item]),
    );
    const classes = new Map(
      (await this.classes.findByIds(previous.map((item) => item.classId!))).map((item) => [
        item.id.value,
        item,
      ]),
    );
    const leads = new Map(
      (
        await this.people.findMany(
          [...classes.values()].flatMap((klass) => (klass.lead ? [klass.lead.accountId] : [])),
        )
      ).map((person) => [person.id, person.fullName]),
    );
    const today = luandaToday(this.clock.now());

    const candidates: ConfirmationCandidateView[] = [];
    for (const enrollment of previous) {
      const catechumen = byId.get(enrollment.catechumenId);
      const klass = classes.get(enrollment.classId!);
      if (!catechumen || !klass) continue;
      const [evaluations, entries] = await Promise.all([
        this.evaluations.listForClass(klass.id.value),
        this.attendance.listForCatechumen(klass.id.value, catechumen.id.value),
      ]);
      const evaluation = evaluations.find((item) => item.catechumenId === catechumen.id.value);
      const rate = attendanceTotals(entries).rate;
      const outcome: YearOutcome =
        evaluation?.outcome ??
        suggestOutcome(averageGrade(evaluation?.grades ?? {}), rate) ??
        "PASSED";
      const record: AnnualRecordView = {
        enrollmentId: enrollment.id.value,
        code: enrollment.code,
        catecheticalYear: enrollment.catecheticalYear,
        catechumenId: catechumen.id.value,
        catechumen: { fullName: catechumen.fullName, birthDate: catechumen.birthDate },
        level: enrollment.level,
        section: klass.section,
        catechistName: klass.lead ? (leads.get(klass.lead.accountId) ?? "—") : "—",
        slot: klass.slot,
        attendanceRate: rate ?? 0,
        outcome,
      };
      const confirmed = current.get(catechumen.id.value);
      if (confirmed) {
        candidates.push({ kind: "already-confirmed", record, confirmedCode: confirmed.code });
        continue;
      }
      const next = outcome === "PASSED" ? nextLevel(enrollment.level) : enrollment.level;
      if (!next) {
        candidates.push({ kind: "completed", record });
        continue;
      }
      const age = ageAt(catechumen.birthDate, today);
      const defaultSlot = slotRequirement(klass.slot, age) ? suggestSlot(age) : klass.slot;
      candidates.push({ kind: "eligible", record, nextLevel: next, age, defaultSlot });
    }
    return candidates.sort((a, b) =>
      a.record.catechumen.fullName.localeCompare(b.record.catechumen.fullName, "pt"),
    );
  }
}

/** Família: os educandos (ou o próprio) que frequentaram no ano anterior. */
export class ListMyConfirmationsUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly candidates: ConfirmationCandidates,
  ) {}

  async execute({ accountId }: { accountId: string }) {
    return this.candidates.forCatechumens(await this.catechumens.findAccessibleBy(accountId));
  }
}

/** Coordenação: procura por nome ou número de matrícula do ano anterior. */
export class SearchConfirmationsUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly calendars: CalendarRepository,
    private readonly candidates: ConfirmationCandidates,
  ) {}

  async execute({ search }: { search: string }) {
    const query = normalize(search.trim());
    if (query.length < 2) return [];
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const previous = await this.enrollments.list({
      catecheticalYear: previousYearLabel(calendar.label),
      status: "CONFIRMED",
    });
    const catechumens = await this.catechumens.findByIds(previous.map((item) => item.catechumenId));
    const names = new Map(catechumens.map((item) => [item.id.value, item.fullName]));
    const matching = new Set(
      previous
        .filter((item) =>
          normalize(`${item.code} ${names.get(item.catechumenId) ?? ""}`).includes(query),
        )
        .map((item) => item.catechumenId),
    );
    const found = await this.candidates.forCatechumens(
      catechumens.filter((item) => matching.has(item.id.value)),
    );
    return found.slice(0, 20);
  }
}

export interface ConfirmInput {
  /** Quem confirma: a família (`assisted` falso) ou a coordenação. */
  actorId: string;
  previousEnrollmentId: string;
  preferredSlot: SessionSlot;
  /** Coordenação em nome da família (sem verificar a conta). */
  assisted?: boolean;
  /** Fora do prazo (coordenação com permissão "fora do prazo"). */
  allowLate?: boolean;
}

/**
 * Confirma a matrícula no novo ano para quem frequentou no anterior: o nível
 * seguinte (ou o mesmo, se repete), já aprovada, a aguardar turma.
 */
export class ConfirmEnrollmentUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly candidates: ConfirmationCandidates,
    private readonly access: CatechesisAccess,
    private readonly codes: EnrollmentCodes,
    private readonly calendars: CalendarRepository,
    private readonly events: EventBus,
    private readonly activity: ActivityRecorder,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute({
    actorId,
    previousEnrollmentId,
    preferredSlot,
    assisted,
    allowLate,
  }: ConfirmInput): Promise<ConfirmationReceiptView> {
    if (!assisted) await this.access.applicant(actorId);
    const previous = await this.enrollments.findById(UniqueId.from(previousEnrollmentId));
    const catechumen = previous
      ? await this.catechumens.findById(UniqueId.from(previous.catechumenId))
      : null;
    if (!previous || !catechumen || (!assisted && !catechumen.isAccessibleBy(actorId))) {
      throw new EnrollmentNotFoundError("Esta matrícula não está associada à sua conta.");
    }
    const [candidate] = (await this.candidates.forCatechumens([catechumen])).filter(
      (item) => item.record.enrollmentId === previous.id.value,
    );
    if (!candidate) {
      throw new ConfirmationNotAllowedError("Só se confirmam matrículas do ano anterior.");
    }
    if (candidate.kind === "already-confirmed") {
      throw new ConfirmationNotAllowedError(
        `Esta matrícula já foi confirmada (${candidate.confirmedCode}).`,
      );
    }
    if (candidate.kind === "completed") {
      throw new ConfirmationNotAllowedError("O percurso da catequese já foi concluído.");
    }
    const slotProblem = slotRequirement(preferredSlot, candidate.age);
    if (slotProblem) throw new ConfirmationNotAllowedError(slotProblem);

    const calendar = (await this.calendars.get())!;
    const now = this.clock.now();
    if (!allowLate) calendar.assertOpen("CONFIRMATION", luandaToday(now));
    const enrollment = Enrollment.confirmFromPrevious({
      previous,
      code: await this.codes.next(Number(calendar.label.slice(0, 4))),
      catechumenId: catechumen.id.value,
      catecheticalYear: calendar.label,
      level: candidate.nextLevel,
      preferredSlot,
      submittedBy: actorId,
      now,
    });
    await this.enrollments.save(enrollment);
    await this.events.publish([new EnrollmentSubmitted(enrollment, catechumen)]);
    await this.activity.record({
      actorId,
      category: "ENROLLMENT",
      action: assisted ? "catechesis.confirmation_assisted" : "catechesis.confirmation_submitted",
      summary: assisted
        ? `Confirmou a matrícula de ${catechumen.fullName} em nome da família (${enrollment.code})`
        : `Confirmou a matrícula de ${catechumen.fullName} para ${calendar.label} (${enrollment.code})`,
    });
    if (!assisted) {
      await this.notifier.notify({
        to: { permission: "COORDINATION" },
        kind: "catechesis.confirmation_submitted",
        title: "Matrícula confirmada pela família",
        body: `${catechumen.fullName} · ${formatLevel(enrollment.level)} (${enrollment.code}). Falta atribuir a turma.`,
        link: `/dashboard/matriculas?matricula=${enrollment.id.value}`,
        exceptAccountId: actorId,
      });
    }
    return {
      id: enrollment.id.value,
      code: enrollment.code,
      previousCode: previous.code,
      catechumenName: catechumen.fullName,
      level: enrollment.level,
      slot: preferredSlot,
      status: enrollment.status,
      catecheticalYear: calendar.label,
      confirmedAt: now.toISOString(),
    };
  }
}
