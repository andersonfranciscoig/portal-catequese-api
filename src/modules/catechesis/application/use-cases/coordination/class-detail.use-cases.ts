import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { AttendanceStatus, YearOutcome } from "../../../domain/catechesis.js";
import { attendanceTotals, type AttendanceEntry } from "../../../domain/class-attendance.js";
import { luandaToday } from "../../../domain/dates.js";
import {
  CalendarNotDefinedError,
  ClassNotFoundError,
} from "../../../domain/errors/catechesis.errors.js";
import { averageGrade, type Grades } from "../../../domain/evaluation.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
  EvaluationRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { assertSameCenter, type CenterScope } from "../../center-scope.js";
import { toClassViews } from "../../views.js";
import type { CoordinationClassView } from "./class.use-cases.js";

/** Anos com turmas e o ano em curso (primeiro). */
export class ListYearsUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
  ) {}

  async execute({ centerId }: { centerId?: string } = {}): Promise<{ year: string; active: boolean }[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const years = new Set([calendar.label, ...(await this.classes.listYears(centerId))]);
    return [...years]
      .sort()
      .reverse()
      .map((year) => ({ year, active: year === calendar.label }));
  }
}

export interface ClassMemberView {
  id: string;
  fullName: string;
  birthDate: string;
  /** Data (YYYY-MM-DD) → estado, nos encontros já realizados. */
  attendance: Record<string, AttendanceStatus>;
  /** Percentagem de presenças. */
  rate?: number;
}

export interface ClassDetailView {
  class: CoordinationClassView;
  isCurrentYear: boolean;
  /** Encontros do ano (os já realizados com `held`). */
  sessions: { date: string; held: boolean }[];
  members: ClassMemberView[];
}

/** Turma com os catequizandos e as presenças de cada encontro. */
export class GetClassDetailUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly attendance: AttendanceRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({
    classId,
    scope,
  }: {
    classId: string;
    scope?: CenterScope;
  }): Promise<ClassDetailView> {
    const klass = await this.classes.findById(UniqueId.from(classId));
    if (!klass) throw new ClassNotFoundError();
    assertSameCenter(scope, klass.centerId);
    const calendar = await this.calendars.get();
    const today = luandaToday(this.clock.now());
    const isCurrentYear = calendar?.label === klass.catecheticalYear;
    const [enrolled, sheets] = await Promise.all([
      this.enrollments.listConfirmedInClass(classId),
      this.attendance.listForClass(classId),
    ]);
    const people = await this.catechumens.findByIds(enrolled.map((item) => item.catechumenId));
    const [view] = await toClassViews([klass], this.people, calendar, today);

    // Ano em curso: o calendário; anos anteriores: os dias com chamada.
    const sessions =
      isCurrentYear && calendar
        ? calendar.sessionDates(klass.slot).map((date) => ({ date, held: date <= today }))
        : sheets.map((sheet) => ({ date: sheet.date, held: true }));

    const byMember = new Map<string, AttendanceEntry[]>();
    for (const sheet of sheets) {
      for (const mark of sheet.marks) {
        byMember.set(mark.catechumenId, [
          ...(byMember.get(mark.catechumenId) ?? []),
          { date: sheet.date, status: mark.status },
        ]);
      }
    }
    const members = people
      .map((person) => {
        const entries = byMember.get(person.id.value) ?? [];
        return {
          id: person.id.value,
          fullName: person.fullName,
          birthDate: person.birthDate,
          attendance: Object.fromEntries(entries.map((entry) => [entry.date, entry.status])),
          rate: attendanceTotals(entries).rate,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
    return { class: { ...view, members: members.length }, isCurrentYear, sessions, members };
  }
}

export interface ResultRowView {
  id: string;
  fullName: string;
  birthDate: string;
  grades: Grades;
  average?: number;
  attendanceRate?: number;
  outcome?: YearOutcome;
}

export interface ClassResultsView {
  classId: string;
  rows: ResultRowView[];
  summary: { passed: number; repeat: number; pending: number };
}

/** Pauta final da turma: notas, média, frequência e resultado. */
export class GetClassResultsUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
  ) {}

  async execute({
    classId,
    scope,
  }: {
    classId: string;
    scope?: CenterScope;
  }): Promise<ClassResultsView> {
    const klass = await this.classes.findById(UniqueId.from(classId));
    if (!klass) throw new ClassNotFoundError();
    assertSameCenter(scope, klass.centerId);
    const [enrolled, sheets, saved] = await Promise.all([
      this.enrollments.listConfirmedInClass(classId),
      this.attendance.listForClass(classId),
      this.evaluations.listForClass(classId),
    ]);
    const people = await this.catechumens.findByIds(enrolled.map((item) => item.catechumenId));
    const rows = people
      .map((person) => {
        const evaluation = saved.find((item) => item.catechumenId === person.id.value);
        const entries = sheets.flatMap((sheet) =>
          sheet.marks
            .filter((mark) => mark.catechumenId === person.id.value)
            .map((mark) => ({ date: sheet.date, status: mark.status })),
        );
        return {
          id: person.id.value,
          fullName: person.fullName,
          birthDate: person.birthDate,
          grades: evaluation?.grades ?? {},
          average: averageGrade(evaluation?.grades ?? {}),
          attendanceRate: attendanceTotals(entries).rate,
          outcome: evaluation?.outcome,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
    return {
      classId,
      rows,
      summary: {
        passed: rows.filter((row) => row.outcome === "PASSED").length,
        repeat: rows.filter((row) => row.outcome === "REPEAT").length,
        pending: rows.filter((row) => !row.outcome).length,
      },
    };
  }
}
