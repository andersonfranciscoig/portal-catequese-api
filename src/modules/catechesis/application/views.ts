import type { PeopleDirectory } from "../../../shared/application/people-directory.js";
import type {
  CatecheticalCalendar,
  DateWindow,
  DeadlinePurpose,
} from "../domain/catechetical-calendar.js";
import type {
  AttendanceStatus,
  CatechesisLevel,
  ClassCatechistRole,
  EnrollmentStatus,
  EnrollmentType,
  Gender,
  GuardianRelationship,
  SessionSlot,
  YearOutcome,
} from "../domain/catechesis.js";
import type { CatechesisClass } from "../domain/catechesis-class.js";
import type { Catechumen } from "../domain/catechumen.js";
import type { AttendanceEntry, AttendanceTotals } from "../domain/class-attendance.js";
import type { ReceivedSacramentView } from "./sacrament-records.js";
import { centerRef } from "../domain/center.js";
import type { Enrollment } from "../domain/enrollment.js";
import type { Grades } from "../domain/evaluation.js";

/* ───────────── Vistas devolvidas pela API (read models) ───────────── */

export interface CalendarView {
  label: string;
  startsOn: string;
  endsOn: string;
  /** Prazos das famílias (ausente: sem prazo). */
  windows: Partial<Record<DeadlinePurpose, DateWindow>>;
  updatedAt: string;
}

export interface ClassCatechistView {
  accountId: string;
  fullName: string;
  role: ClassCatechistRole;
}

export interface ClassView {
  id: string;
  catecheticalYear: string;
  level: CatechesisLevel;
  section: string;
  slot: SessionSlot;
  startTime?: string;
  room: string;
  capacity: number;
  center: { id: string; name: string };
  kind: "REGULAR" | "SPECIAL";
  sacrament?: "BAPTISM" | "FIRST_COMMUNION" | "CONFIRMATION";
  audience?: "CHILD" | "ADULT";
  catechists: ClassCatechistView[];
  /** Próximo encontro (YYYY-MM-DD), se o ano ainda não acabou. */
  nextSessionDate?: string;
}

export interface EnrollmentView {
  id: string;
  code: string;
  catechumenId: string;
  catechumenName: string;
  catecheticalYear: string;
  level: CatechesisLevel;
  type: EnrollmentType;
  status: EnrollmentStatus;
  preferredSlot: SessionSlot;
  previousParish?: string;
  submittedAt: string;
  classId?: string;
  /** Motivo da recusa ou documentos em falta (o que a coordenação escreveu). */
  reviewNote?: string;
  /** A família entrega os documentos em papel na secretaria. */
  documentsInPerson: boolean;
  center: { id: string; name: string };
}

export interface CatechumenCardView {
  id: string;
  fullName: string;
  /** Matrícula do ano em curso. */
  enrollment: EnrollmentView;
  classInfo?: ClassView;
}

export interface FamilyView {
  catecheticalYear: string;
  children: CatechumenCardView[];
  enrollments: EnrollmentView[];
}

export interface AttendanceSummaryView extends AttendanceTotals {
  catecheticalYear: string;
  /** Mais recentes primeiro. */
  recent: AttendanceEntry[];
}

export interface CatechumenProfileView {
  id: string;
  fullName: string;
  birthDate: string;
  gender: Gender;
  baptized: boolean;
  firstCommunion: boolean;
  /** Os três sacramentos, sempre (recebidos ou não), com data e paróquia. */
  sacraments: ReceivedSacramentView[];
  /** É o próprio (adulto) ou um educando. */
  self: boolean;
  enrollment: EnrollmentView;
  classInfo?: ClassView;
  attendance: AttendanceSummaryView | null;
}

export interface ClassMemberView {
  id: string;
  fullName: string;
  birthDate: string;
}

export interface RollSessionView {
  date: string;
  marked: boolean;
  present: number;
  total: number;
}

export interface MyClassView {
  catecheticalYear: string;
  class: ClassView | null;
  members: ClassMemberView[];
  sessions: RollSessionView[];
  nextSessionDate?: string;
}

export interface RollView {
  date: string;
  marked: boolean;
  members: (ClassMemberView & { status: AttendanceStatus | null })[];
}

export interface EvaluationRowView extends ClassMemberView {
  attendanceRate?: number;
  grades: Grades;
  outcome?: YearOutcome;
  average?: number;
  suggested?: YearOutcome;
}

export interface CatechumenFileView extends EvaluationRowView {
  attendance: AttendanceEntry[];
  guardian?: { fullName: string; relationship?: GuardianRelationship; phone: string };
}

/* ───────────── Montagem ───────────── */

export function toCalendarView(calendar: CatecheticalCalendar): CalendarView {
  return {
    label: calendar.label,
    startsOn: calendar.startsOn,
    endsOn: calendar.endsOn,
    windows: { ...calendar.windows },
    updatedAt: calendar.updatedAt.toISOString(),
  };
}

export function toEnrollmentView(enrollment: Enrollment, catechumenName: string): EnrollmentView {
  return {
    id: enrollment.id.value,
    code: enrollment.code,
    catechumenId: enrollment.catechumenId,
    catechumenName,
    catecheticalYear: enrollment.catecheticalYear,
    level: enrollment.level,
    type: enrollment.type,
    status: enrollment.status,
    preferredSlot: enrollment.preferredSlot,
    previousParish: enrollment.previousParish,
    submittedAt: enrollment.submittedAt.toISOString(),
    classId: enrollment.classId,
    reviewNote: enrollment.reviewNote,
    documentsInPerson: enrollment.documentsInPerson,
    center: centerRef(enrollment.centerId),
  };
}

export function toMemberView(catechumen: Catechumen): ClassMemberView {
  return {
    id: catechumen.id.value,
    fullName: catechumen.fullName,
    birthDate: catechumen.birthDate,
  };
}

/** Turmas com os nomes dos catequistas (um só pedido ao diretório) e o próximo encontro. */
export async function toClassViews(
  classes: CatechesisClass[],
  people: PeopleDirectory,
  calendar: CatecheticalCalendar | null,
  today: string,
): Promise<ClassView[]> {
  const names = new Map(
    (
      await people.findMany(
        classes.flatMap((klass) => klass.catechists.map((item) => item.accountId)),
      )
    ).map((person) => [person.id, person.fullName]),
  );
  return classes.map((klass) => ({
    id: klass.id.value,
    catecheticalYear: klass.catecheticalYear,
    level: klass.level,
    section: klass.section,
    slot: klass.slot,
    startTime: klass.startTime,
    room: klass.room,
    capacity: klass.capacity,
    center: centerRef(klass.centerId),
    kind: klass.kind,
    sacrament: klass.sacrament,
    audience: klass.audience,
    // O principal primeiro.
    catechists: [...klass.catechists]
      .sort((a, b) => Number(b.role === "LEAD") - Number(a.role === "LEAD"))
      .map((item) => ({
        accountId: item.accountId,
        fullName: names.get(item.accountId) ?? "—",
        role: item.role,
      })),
    nextSessionDate:
      calendar && klass.catecheticalYear === calendar.label
        ? calendar.nextSession(klass.slot, today)
        : undefined,
  }));
}
