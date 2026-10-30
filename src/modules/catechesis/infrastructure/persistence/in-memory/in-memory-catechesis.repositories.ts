import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { rememberCenterName, SEDE_CENTER_ID, type Center } from "../../../domain/center.js";
import type { Announcement } from "../../../domain/announcement.js";
import type { CalendarActivity } from "../../../domain/calendar-activity.js";
import type { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import type { CatechistPresence, CatechistProfile } from "../../../domain/catechist-records.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import type { ClassAttendance } from "../../../domain/class-attendance.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import type { EnrollmentDocument } from "../../../domain/enrollment-document.js";
import type { Evaluation } from "../../../domain/evaluation.js";
import type { RollReminder } from "../../../domain/roll-deadline.js";
import type {
  RequirementCheck,
  SacramentCelebration,
  SacramentType,
} from "../../../domain/sacraments.js";
import {
  AttendanceRepository,
  CalendarRepository,
  CenterRepository,
  CatechistPresenceRepository,
  CatechistProfileRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
  EvaluationRepository,
  type EnrollmentQuery,
  AnnouncementRepository,
  CalendarActivityRepository,
  RollReminderRepository,
  SacramentRecordRepository,
  SacramentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { SacramentRecord } from "../../../domain/sacrament-records.js";

/* Repositórios em memória: testes e desenvolvimento sem base de dados. */

export class InMemorySacramentRecordRepository extends SacramentRecordRepository {
  /** "catequizando|tipo" → registo */
  readonly items = new Map<string, SacramentRecord>();
  private all() {
    return [...this.items.values()].map((item) => structuredClone(item));
  }
  async listForCatechumens(catechumenIds: string[]) {
    return this.all().filter((item) => catechumenIds.includes(item.catechumenId));
  }
  async listForCelebration(celebrationId: string) {
    return this.all().filter((item) => item.celebrationId === celebrationId);
  }
  async list(type?: SacramentType) {
    return this.all().filter((item) => !type || item.type === type);
  }
  async save(record: SacramentRecord) {
    const key = `${record.catechumenId}|${record.type}`;
    const current = this.items.get(key);
    this.items.set(key, structuredClone({ ...record, id: current?.id ?? record.id }));
  }
  async delete(catechumenId: string, type: SacramentType) {
    this.items.delete(`${catechumenId}|${type}`);
  }
}

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
  async findByCode(code: string) {
    return this.all().find((item) => item.code === code) ?? null;
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
  async listForCatechist(accountId: string) {
    return [...this.items.values()].filter((item) => item.hasCatechist(accountId));
  }
  async listYears(centerId?: string) {
    return [
      ...new Set(
        [...this.items.values()]
          .filter((item) => !centerId || item.centerId === centerId)
          .map((item) => item.catecheticalYear),
      ),
    ]
      .sort()
      .reverse();
  }
  async findForCatechist(accountId: string, catecheticalYear: string) {
    return (
      [...this.items.values()].find(
        (item) => item.catecheticalYear === catecheticalYear && item.hasCatechist(accountId),
      ) ?? null
    );
  }
  async exists(
    catecheticalYear: string,
    level: string,
    section: string,
    centerId = SEDE_CENTER_ID,
    kind = "REGULAR",
  ) {
    return [...this.items.values()].some(
      (item) =>
        item.catecheticalYear === catecheticalYear &&
        item.level === level &&
        item.section === section &&
        item.centerId === centerId &&
        item.kind === kind,
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
  async listRollDates(classIds: string[], from: string) {
    return [...this.sheets.values()]
      .filter((item) => classIds.includes(item.classId) && item.date >= from)
      .map(({ classId, date }) => ({ classId, date }));
  }
}

export class InMemoryRollReminderRepository extends RollReminderRepository {
  readonly items = new Map<string, RollReminder>();
  async claim(reminder: RollReminder) {
    const key = `${reminder.classId}|${reminder.date}`;
    if (this.items.has(key)) return false;
    this.items.set(key, { ...reminder });
    return true;
  }
  async listForClasses(classIds: string[]) {
    return [...this.items.values()].filter((item) => classIds.includes(item.classId));
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

export class InMemoryEnrollmentDocumentRepository extends EnrollmentDocumentRepository {
  readonly items = new Map<string, EnrollmentDocument>();
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async listForEnrollment(enrollmentId: string) {
    return [...this.items.values()].filter((item) => item.enrollmentId === enrollmentId);
  }
  async listForEnrollments(enrollmentIds: string[]) {
    return [...this.items.values()].filter((item) => enrollmentIds.includes(item.enrollmentId));
  }
  async save(document: EnrollmentDocument) {
    const previous =
      [...this.items.values()].find(
        (item) => item.enrollmentId === document.enrollmentId && item.kind === document.kind,
      ) ?? null;
    if (previous) this.items.delete(previous.id.value);
    this.items.set(document.id.value, document);
    return previous;
  }
}

export class InMemoryCatechistProfileRepository extends CatechistProfileRepository {
  readonly items = new Map<string, CatechistProfile>();
  async list() {
    return [...this.items.values()];
  }
  async find(accountId: string) {
    return this.items.get(accountId) ?? null;
  }
  async save(profile: CatechistProfile) {
    this.items.set(profile.accountId, { ...profile });
  }
}

export class InMemoryCatechistPresenceRepository extends CatechistPresenceRepository {
  readonly items = new Map<string, CatechistPresence>();
  async listForDate(date: string) {
    return [...this.items.values()].filter((item) => item.date === date);
  }
  async listForClasses(classIds: string[]) {
    return [...this.items.values()].filter((item) => classIds.includes(item.classId));
  }
  async save(presence: CatechistPresence) {
    this.items.set(`${presence.classId}|${presence.date}`, { ...presence });
  }
}

export class InMemorySacramentRepository extends SacramentRepository {
  readonly celebrations = new Map<string, SacramentCelebration>();
  readonly checks = new Map<string, RequirementCheck>();
  async listCelebrations(catecheticalYear: string) {
    return [...this.celebrations.values()]
      .filter((item) => item.catecheticalYear === catecheticalYear)
      .map((item) => structuredClone(item));
  }
  async findCelebration(id: string) {
    const found = this.celebrations.get(id);
    return found ? structuredClone(found) : null;
  }
  async saveCelebration(celebration: SacramentCelebration) {
    this.celebrations.set(celebration.id, structuredClone(celebration));
  }
  async deleteCelebration(id: string) {
    return this.celebrations.delete(id);
  }
  async listChecks(catechumenIds: string[], sacrament: SacramentType) {
    return [...this.checks.values()].filter(
      (item) => item.sacrament === sacrament && catechumenIds.includes(item.catechumenId),
    );
  }
  async saveCheck(check: RequirementCheck) {
    this.checks.set(`${check.catechumenId}:${check.sacrament}:${check.requirement}`, { ...check });
  }
}

export class InMemoryAnnouncementRepository extends AnnouncementRepository {
  readonly items = new Map<string, Announcement>();
  readonly reads = new Map<string, Date>();

  async list() {
    return [...this.items.values()];
  }

  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }

  async save(announcement: Announcement) {
    this.items.set(announcement.id.value, announcement);
  }

  async delete(id: UniqueId) {
    const existed = this.items.delete(id.value);
    for (const key of this.reads.keys()) {
      if (key.startsWith(`${id.value}|`)) this.reads.delete(key);
    }
    return existed;
  }

  async readCounts(ids: string[]) {
    const counts = new Map<string, number>();
    for (const key of this.reads.keys()) {
      const announcementId = key.slice(0, key.indexOf("|"));
      if (!ids.includes(announcementId)) continue;
      counts.set(announcementId, (counts.get(announcementId) ?? 0) + 1);
    }
    return counts;
  }

  async markRead(announcementIds: string[], accountId: string, at: Date) {
    for (const id of announcementIds) {
      const key = `${id}|${accountId}`;
      if (!this.reads.has(key)) this.reads.set(key, at);
    }
  }
}

export class InMemoryCenterRepository extends CenterRepository {
  readonly items = new Map<string, Center>();

  async findById(id: string) {
    return this.items.get(id) ?? null;
  }

  async list(status?: Center["status"]) {
    return [...this.items.values()]
      .filter((item) => !status || item.status === status)
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }

  async save(center: Center) {
    rememberCenterName(center.id.value, center.name);
    this.items.set(center.id.value, center);
  }
}

export class InMemoryCalendarActivityRepository extends CalendarActivityRepository {
  readonly items = new Map<string, CalendarActivity>();

  async list() {
    return [...this.items.values()];
  }

  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }

  async save(activity: CalendarActivity) {
    this.items.set(activity.id.value, activity);
  }

  async delete(id: UniqueId) {
    return this.items.delete(id.value);
  }
}
