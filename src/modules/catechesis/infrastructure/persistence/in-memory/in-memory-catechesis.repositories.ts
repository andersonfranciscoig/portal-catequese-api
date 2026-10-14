import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import type { ClassAttendance } from "../../../domain/class-attendance.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import type { Evaluation } from "../../../domain/evaluation.js";
import {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
  EvaluationRepository,
  type EnrollmentQuery,
} from "../../../domain/repositories/catechesis.repositories.js";

/* Repositórios em memória: testes e desenvolvimento sem base de dados. */

export class InMemoryCalendarRepository extends CalendarRepository {
  current: CatecheticalCalendar | null = null;
  async get() {
    return this.current;
  }
  async save(calendar: CatecheticalCalendar) {
    this.current = calendar;
  }
}

export class InMemoryCatechumenRepository extends CatechumenRepository {
  readonly items = new Map<string, Catechumen>();
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => this.items.get(id) ?? []);
  }
  async findAccessibleBy(accountId: string) {
    return [...this.items.values()].filter((item) => item.isAccessibleBy(accountId));
  }
  async save(catechumen: Catechumen) {
    this.items.set(catechumen.id.value, catechumen);
  }
}

export class InMemoryEnrollmentRepository extends EnrollmentRepository {
  readonly items = new Map<string, Enrollment>();
  private all() {
    return [...this.items.values()];
  }
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async findForCatechumen(catechumenId: string, catecheticalYear: string) {
    return (
      this.all().find(
        (item) => item.catechumenId === catechumenId && item.catecheticalYear === catecheticalYear,
      ) ?? null
    );
  }
  async listForCatechumens(catechumenIds: string[]) {
    return this.all().filter((item) => catechumenIds.includes(item.catechumenId));
  }
  async list({ catecheticalYear, status }: EnrollmentQuery) {
    return this.all().filter(
      (item) => item.catecheticalYear === catecheticalYear && (!status || item.status === status),
    );
  }
  async listConfirmedInClass(classId: string) {
    return this.all().filter((item) => item.isConfirmed && item.classId === classId);
  }
  async countConfirmedInClass(classId: string) {
    return (await this.listConfirmedInClass(classId)).length;
  }
  async codeExists(code: string) {
    return this.all().some((item) => item.code === code);
  }
  async save(enrollment: Enrollment) {
    this.items.set(enrollment.id.value, enrollment);
  }
}

export class InMemoryClassRepository extends ClassRepository {
  readonly items = new Map<string, CatechesisClass>();
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => this.items.get(id) ?? []);
  }
  async listByYear(catecheticalYear: string) {
    return [...this.items.values()].filter((item) => item.catecheticalYear === catecheticalYear);
  }
  async findForCatechist(accountId: string, catecheticalYear: string) {
    return (
      [...this.items.values()].find(
        (item) => item.catecheticalYear === catecheticalYear && item.hasCatechist(accountId),
      ) ?? null
    );
  }
  async exists(catecheticalYear: string, level: string, section: string) {
    return [...this.items.values()].some(
      (item) =>
        item.catecheticalYear === catecheticalYear &&
        item.level === level &&
        item.section === section,
    );
  }
  async save(klass: CatechesisClass) {
    this.items.set(klass.id.value, klass);
  }
}

export class InMemoryAttendanceRepository extends AttendanceRepository {
  readonly sheets = new Map<string, ClassAttendance>();
  async listForClass(classId: string) {
    return [...this.sheets.values()]
      .filter((item) => item.classId === classId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async listForCatechumen(classId: string, catechumenId: string) {
    return (await this.listForClass(classId)).flatMap((sheet) =>
      sheet.marks
        .filter((mark) => mark.catechumenId === catechumenId)
        .map((mark) => ({ date: sheet.date, status: mark.status })),
    );
  }
  async save(attendance: ClassAttendance) {
    this.sheets.set(`${attendance.classId}|${attendance.date}`, structuredClone(attendance));
  }
}

export class InMemoryEvaluationRepository extends EvaluationRepository {
  readonly items = new Map<string, Evaluation>();
  async listForClass(classId: string) {
    return [...this.items.values()].filter((item) => item.classId === classId);
  }
  async saveMany(evaluations: Evaluation[]) {
    for (const item of evaluations) {
      this.items.set(`${item.classId}|${item.catechumenId}`, structuredClone(item));
    }
  }
}
