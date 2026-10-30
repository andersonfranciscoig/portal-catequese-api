import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type {
  CatechesisClass as ClassRow,
  ClassCatechist as ClassCatechistRow,
  Catechumen as CatechumenRow,
  Enrollment as EnrollmentRow,
  EnrollmentDocument as EnrollmentDocumentRow,
  Prisma,
} from "../../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { SEDE_CENTER_ID } from "../../../domain/center.js";
import { Announcement, type AnnouncementAudience } from "../../../domain/announcement.js";
import { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import { CatechesisClass } from "../../../domain/catechesis-class.js";
import type { CatechistPresence, CatechistProfile } from "../../../domain/catechist-records.js";
import { Catechumen } from "../../../domain/catechumen.js";
import type { ClassAttendance } from "../../../domain/class-attendance.js";
import type { AllowedContentType } from "../../../../../shared/application/file-storage.js";
import type { EnrollmentStatus } from "../../../domain/catechesis.js";
import { Enrollment, type EnrollmentEvent } from "../../../domain/enrollment.js";
import { EnrollmentDocument } from "../../../domain/enrollment-document.js";
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
  CatechistPresenceRepository,
  CatechistProfileRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
  EvaluationRepository,
  type EnrollmentQuery,
  AnnouncementRepository,
  RollReminderRepository,
  SacramentRecordRepository,
  SacramentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { SacramentRecord } from "../../../domain/sacrament-records.js";

const CALENDAR_ID = CatecheticalCalendar.ID.value;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids que não são UUID nunca existem (e a base de dados recusá-los-ia). */
const validIds = (ids: string[]) => [...new Set(ids)].filter((id) => UUID.test(id));
const orUndefined = <T>(value: T | null) => value ?? undefined;

@Injectable()
export class PrismaCalendarRepository extends CalendarRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async get() {
    const row = await this.prisma.catecheticalCalendar.findUnique({ where: { id: CALENDAR_ID } });
    return row
      ? CatecheticalCalendar.restore({
          label: row.label,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          updatedAt: row.updatedAt,
          updatedBy: orUndefined(row.updatedBy),
          windows: {
            ...(row.enrollmentStartsOn && row.enrollmentEndsOn
              ? { ENROLLMENT: { startsOn: row.enrollmentStartsOn, endsOn: row.enrollmentEndsOn } }
              : {}),
            ...(row.confirmationStartsOn && row.confirmationEndsOn
              ? {
                  CONFIRMATION: {
                    startsOn: row.confirmationStartsOn,
                    endsOn: row.confirmationEndsOn,
                  },
                }
              : {}),
          },
        })
      : null;
  }

  async save(calendar: CatecheticalCalendar) {
    const data = {
      label: calendar.label,
      startsOn: calendar.startsOn,
      endsOn: calendar.endsOn,
      updatedAt: calendar.updatedAt,
      updatedBy: calendar.updatedBy ?? null,
      enrollmentStartsOn: calendar.windows.ENROLLMENT?.startsOn ?? null,
      enrollmentEndsOn: calendar.windows.ENROLLMENT?.endsOn ?? null,
      confirmationStartsOn: calendar.windows.CONFIRMATION?.startsOn ?? null,
      confirmationEndsOn: calendar.windows.CONFIRMATION?.endsOn ?? null,
    };
    await this.prisma.catecheticalCalendar.upsert({
      where: { id: CALENDAR_ID },
      create: { id: CALENDAR_ID, ...data },
      update: data,
    });
  }
}

function toCatechumen(row: CatechumenRow) {
  return Catechumen.restore(
    {
      fullName: row.fullName,
      birthDate: row.birthDate,
      gender: row.gender,
      address: orUndefined(row.address),
      baptized: row.baptized,
      firstCommunion: row.firstCommunion,
      guardianAccountId: orUndefined(row.guardianAccountId),
      guardianRelationship: orUndefined(row.guardianRelationship),
      accountId: orUndefined(row.accountId),
      centerId: row.centerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaCatechumenRepository extends CatechumenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.catechumen.findUnique({ where: { id: id.value } });
    return row ? toCatechumen(row) : null;
  }

  async findByIds(ids: string[]) {
    const rows = await this.prisma.catechumen.findMany({ where: { id: { in: validIds(ids) } } });
    return rows.map(toCatechumen);
  }

  async findAccessibleBy(accountId: string) {
    if (!UUID.test(accountId)) return [];
    const rows = await this.prisma.catechumen.findMany({
      where: { OR: [{ guardianAccountId: accountId }, { accountId }] },
      orderBy: { fullName: "asc" },
    });
    return rows.map(toCatechumen);
  }

  async save(catechumen: Catechumen) {
    const data = {
      fullName: catechumen.fullName,
      birthDate: catechumen.birthDate,
      gender: catechumen.gender,
      address: catechumen.address ?? null,
      baptized: catechumen.baptized,
      firstCommunion: catechumen.firstCommunion,
      guardianAccountId: catechumen.guardianAccountId ?? null,
      guardianRelationship: catechumen.guardianRelationship ?? null,
      accountId: catechumen.accountId ?? null,
      centerId: catechumen.centerId,
      updatedAt: catechumen.updatedAt,
    };
    await this.prisma.catechumen.upsert({
      where: { id: catechumen.id.value },
      create: { id: catechumen.id.value, createdAt: catechumen.createdAt, ...data },
      update: data,
    });
  }
}

function toEnrollment(row: EnrollmentRow) {
  return Enrollment.restore(
    {
      code: row.code,
      centerId: row.centerId,
      catechumenId: row.catechumenId,
      catecheticalYear: row.catecheticalYear,
      level: row.level,
      type: row.type,
      status: row.status,
      preferredSlot: row.preferredSlot,
      previousParish: orUndefined(row.previousParish),
      notes: orUndefined(row.notes),
      submittedBy: row.submittedBy,
      submittedAt: row.submittedAt,
      classId: orUndefined(row.classId),
      decidedBy: orUndefined(row.decidedBy),
      decidedAt: orUndefined(row.decidedAt),
      updatedAt: row.updatedAt,
      documentsInPerson: row.documentsInPerson,
      reviewNote: orUndefined(row.reviewNote),
      previousEnrollmentId: orUndefined(row.previousEnrollmentId),
      history: readHistory(row.history),
    },
    UniqueId.from(row.id),
  );
}

interface StoredEvent {
  status: EnrollmentStatus;
  at: string;
  actorId?: string;
  note?: string;
}

function readHistory(value: Prisma.JsonValue): EnrollmentEvent[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown as StoredEvent[]).map((event) => ({
    status: event.status,
    at: new Date(event.at),
    actorId: event.actorId,
    note: event.note,
  }));
}

function writeHistory(history: readonly EnrollmentEvent[]): Prisma.InputJsonValue {
  return history.map((event) => ({
    status: event.status,
    at: event.at.toISOString(),
    ...(event.actorId ? { actorId: event.actorId } : {}),
    ...(event.note ? { note: event.note } : {}),
  }));
}

@Injectable()
export class PrismaEnrollmentRepository extends EnrollmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.enrollment.findUnique({ where: { id: id.value } });
    return row ? toEnrollment(row) : null;
  }

  async findForCatechumen(catechumenId: string, catecheticalYear: string) {
    if (!UUID.test(catechumenId)) return null;
    const row = await this.prisma.enrollment.findUnique({
      where: { catechumenId_catecheticalYear: { catechumenId, catecheticalYear } },
    });
    return row ? toEnrollment(row) : null;
  }

  async listForCatechumens(catechumenIds: string[]) {
    const rows = await this.prisma.enrollment.findMany({
      where: { catechumenId: { in: validIds(catechumenIds) } },
      orderBy: { submittedAt: "desc" },
    });
    return rows.map(toEnrollment);
  }

  async list({ catecheticalYear, status }: EnrollmentQuery) {
    const rows = await this.prisma.enrollment.findMany({
      where: { catecheticalYear, status },
      orderBy: { submittedAt: "desc" },
    });
    return rows.map(toEnrollment);
  }

  async listConfirmedInClass(classId: string) {
    if (!UUID.test(classId)) return [];
    const rows = await this.prisma.enrollment.findMany({
      where: { classId, status: "CONFIRMED" },
    });
    return rows.map(toEnrollment);
  }

  async countConfirmedInClass(classId: string) {
    if (!UUID.test(classId)) return 0;
    return this.prisma.enrollment.count({ where: { classId, status: "CONFIRMED" } });
  }

  async findByCode(code: string) {
    const row = await this.prisma.enrollment.findUnique({ where: { code } });
    return row ? toEnrollment(row) : null;
  }

  async codeExists(code: string) {
    return (await this.prisma.enrollment.count({ where: { code } })) > 0;
  }

  async save(enrollment: Enrollment) {
    const data = {
      status: enrollment.status,
      centerId: enrollment.centerId,
      level: enrollment.level,
      type: enrollment.type,
      preferredSlot: enrollment.preferredSlot,
      previousParish: enrollment.previousParish ?? null,
      notes: enrollment.notes ?? null,
      classId: enrollment.classId ?? null,
      decidedBy: enrollment.decidedBy ?? null,
      decidedAt: enrollment.decidedAt ?? null,
      updatedAt: enrollment.updatedAt,
      documentsInPerson: enrollment.documentsInPerson,
      reviewNote: enrollment.reviewNote ?? null,
      history: writeHistory(enrollment.history),
    };
    await this.prisma.enrollment.upsert({
      where: { id: enrollment.id.value },
      create: {
        id: enrollment.id.value,
        code: enrollment.code,
        catechumenId: enrollment.catechumenId,
        catecheticalYear: enrollment.catecheticalYear,
        submittedBy: enrollment.submittedBy,
        submittedAt: enrollment.submittedAt,
        previousEnrollmentId: enrollment.previousEnrollmentId ?? null,
        ...data,
      },
      update: data,
    });
  }
}

function toClass(row: ClassRow & { catechists: ClassCatechistRow[] }) {
  return CatechesisClass.restore(
    {
      catecheticalYear: row.catecheticalYear,
      level: row.level,
      section: row.section,
      slot: row.slot,
      startTime: orUndefined(row.startTime),
      room: row.room,
      capacity: row.capacity,
      centerId: row.centerId,
      catechists: row.catechists.map((item) => ({ accountId: item.accountId, role: item.role })),
      createdAt: row.createdAt,
    },
    UniqueId.from(row.id),
  );
}

const withCatechists = { catechists: true } as const;

@Injectable()
export class PrismaClassRepository extends ClassRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.catechesisClass.findUnique({
      where: { id: id.value },
      include: withCatechists,
    });
    return row ? toClass(row) : null;
  }

  async findByIds(ids: string[]) {
    const rows = await this.prisma.catechesisClass.findMany({
      where: { id: { in: validIds(ids) } },
      include: withCatechists,
    });
    return rows.map(toClass);
  }

  async listByYear(catecheticalYear: string) {
    const rows = await this.prisma.catechesisClass.findMany({
      where: { catecheticalYear },
      include: withCatechists,
      orderBy: [{ level: "asc" }, { section: "asc" }],
    });
    return rows.map(toClass);
  }

  async listForCatechist(accountId: string) {
    if (!UUID.test(accountId)) return [];
    const rows = await this.prisma.catechesisClass.findMany({
      where: { catechists: { some: { accountId } } },
      include: withCatechists,
      orderBy: { catecheticalYear: "desc" },
    });
    return rows.map(toClass);
  }

  async listYears(centerId?: string) {
    const rows = await this.prisma.catechesisClass.findMany({
      where: centerId ? { centerId } : undefined,
      distinct: ["catecheticalYear"],
      select: { catecheticalYear: true },
      orderBy: { catecheticalYear: "desc" },
    });
    return rows.map((row) => row.catecheticalYear);
  }

  async findForCatechist(accountId: string, catecheticalYear: string) {
    if (!UUID.test(accountId)) return null;
    const row = await this.prisma.catechesisClass.findFirst({
      where: { catecheticalYear, catechists: { some: { accountId } } },
      include: withCatechists,
    });
    return row ? toClass(row) : null;
  }

  async exists(
    catecheticalYear: string,
    level: string,
    section: string,
    centerId = SEDE_CENTER_ID,
  ) {
    const count = await this.prisma.catechesisClass.count({
      where: {
        catecheticalYear,
        level: level as ClassRow["level"],
        section,
        centerId,
      },
    });
    return count > 0;
  }

  async save(klass: CatechesisClass) {
    const data = {
      level: klass.level,
      section: klass.section,
      slot: klass.slot,
      startTime: klass.startTime ?? null,
      room: klass.room,
      capacity: klass.capacity,
      centerId: klass.centerId,
    };
    // A turma e os catequistas mudam juntos (ou nada muda).
    await this.prisma.$transaction([
      this.prisma.catechesisClass.upsert({
        where: { id: klass.id.value },
        create: {
          id: klass.id.value,
          catecheticalYear: klass.catecheticalYear,
          createdAt: klass.createdAt,
          ...data,
        },
        update: data,
      }),
      this.prisma.classCatechist.deleteMany({ where: { classId: klass.id.value } }),
      this.prisma.classCatechist.createMany({
        data: klass.catechists.map((item) => ({
          classId: klass.id.value,
          accountId: item.accountId,
          role: item.role,
        })),
      }),
    ]);
  }
}

@Injectable()
export class PrismaAttendanceRepository extends AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForClass(classId: string) {
    if (!UUID.test(classId)) return [];
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { classId },
      orderBy: { date: "asc" },
    });
    const sheets = new Map<string, ClassAttendance>();
    for (const row of rows) {
      const sheet = sheets.get(row.date) ?? {
        classId,
        date: row.date,
        marks: [],
        recordedBy: row.recordedBy,
        recordedAt: row.recordedAt,
      };
      sheet.marks.push({ catechumenId: row.catechumenId, status: row.status });
      sheets.set(row.date, sheet);
    }
    return [...sheets.values()];
  }

  async listForCatechumen(classId: string, catechumenId: string) {
    if (!UUID.test(classId) || !UUID.test(catechumenId)) return [];
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { classId, catechumenId },
      orderBy: { date: "asc" },
      select: { date: true, status: true },
    });
    return rows;
  }

  async save({ classId, date, marks, recordedBy, recordedAt }: ClassAttendance) {
    await this.prisma.$transaction([
      this.prisma.attendanceRecord.deleteMany({ where: { classId, date } }),
      this.prisma.attendanceRecord.createMany({
        data: marks.map((mark) => ({
          classId,
          date,
          catechumenId: mark.catechumenId,
          status: mark.status,
          recordedBy,
          recordedAt,
        })),
      }),
    ]);
  }

  async listRollDates(classIds: string[], from: string) {
    const ids = validIds(classIds);
    if (!ids.length) return [];
    return this.prisma.attendanceRecord.findMany({
      where: { classId: { in: ids }, date: { gte: from } },
      distinct: ["classId", "date"],
      select: { classId: true, date: true },
    });
  }
}

@Injectable()
export class PrismaEvaluationRepository extends EvaluationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForClass(classId: string) {
    if (!UUID.test(classId)) return [];
    const rows = await this.prisma.evaluation.findMany({ where: { classId } });
    return rows.map((row): Evaluation => ({
      classId: row.classId,
      catechumenId: row.catechumenId,
      grades: Object.fromEntries(
        (["T1", "T2", "T3"] as const).flatMap((term) => {
          const value = row[term.toLowerCase() as "t1" | "t2" | "t3"];
          return value === null ? [] : [[term, value]];
        }),
      ),
      outcome: orUndefined(row.outcome),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    }));
  }

  async saveMany(evaluations: Evaluation[]) {
    await this.prisma.$transaction(
      evaluations.map((item) => {
        const data = {
          t1: item.grades.T1 ?? null,
          t2: item.grades.T2 ?? null,
          t3: item.grades.T3 ?? null,
          outcome: item.outcome ?? null,
          updatedBy: item.updatedBy,
          updatedAt: item.updatedAt,
        };
        return this.prisma.evaluation.upsert({
          where: {
            classId_catechumenId: { classId: item.classId, catechumenId: item.catechumenId },
          },
          create: { classId: item.classId, catechumenId: item.catechumenId, ...data },
          update: data,
        });
      }),
    );
  }
}

function toDocument(row: EnrollmentDocumentRow) {
  return EnrollmentDocument.restore(
    {
      enrollmentId: row.enrollmentId,
      kind: row.kind,
      file: {
        key: row.fileKey,
        name: row.fileName,
        size: row.fileSize,
        contentType: row.contentType as AllowedContentType,
      },
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaEnrollmentDocumentRepository extends EnrollmentDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.enrollmentDocument.findUnique({ where: { id: id.value } });
    return row ? toDocument(row) : null;
  }

  async listForEnrollment(enrollmentId: string) {
    if (!UUID.test(enrollmentId)) return [];
    const rows = await this.prisma.enrollmentDocument.findMany({
      where: { enrollmentId },
      orderBy: { uploadedAt: "asc" },
    });
    return rows.map(toDocument);
  }

  async listForEnrollments(enrollmentIds: string[]) {
    const rows = await this.prisma.enrollmentDocument.findMany({
      where: { enrollmentId: { in: validIds(enrollmentIds) } },
    });
    return rows.map(toDocument);
  }

  async save(document: EnrollmentDocument) {
    const where = {
      enrollmentId_kind: { enrollmentId: document.enrollmentId, kind: document.kind },
    };
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.enrollmentDocument.findUnique({ where });
      if (previous) await tx.enrollmentDocument.delete({ where: { id: previous.id } });
      await tx.enrollmentDocument.create({
        data: {
          id: document.id.value,
          enrollmentId: document.enrollmentId,
          kind: document.kind,
          fileKey: document.file.key,
          fileName: document.file.name,
          fileSize: document.file.size,
          contentType: document.file.contentType,
          uploadedBy: document.uploadedBy,
          uploadedAt: document.uploadedAt,
        },
      });
      return previous ? toDocument(previous) : null;
    });
  }
}

@Injectable()
export class PrismaCatechistProfileRepository extends CatechistProfileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    return (await this.prisma.catechistProfile.findMany()).map(toProfile);
  }

  async find(accountId: string) {
    if (!UUID.test(accountId)) return null;
    const row = await this.prisma.catechistProfile.findUnique({ where: { accountId } });
    return row ? toProfile(row) : null;
  }

  async save(profile: CatechistProfile) {
    const data = {
      status: profile.status ?? null,
      centerId: profile.centerId,
      updatedAt: profile.updatedAt,
      updatedBy: profile.updatedBy ?? null,
    };
    await this.prisma.catechistProfile.upsert({
      where: { accountId: profile.accountId },
      create: { accountId: profile.accountId, ...data },
      update: data,
    });
  }
}

function toProfile(row: {
  accountId: string;
  status: CatechistProfile["status"] | null;
  centerId: string;
  updatedAt: Date;
  updatedBy: string | null;
}): CatechistProfile {
  return {
    accountId: row.accountId,
    status: orUndefined(row.status),
    centerId: row.centerId,
    updatedAt: row.updatedAt,
    updatedBy: orUndefined(row.updatedBy),
  };
}

@Injectable()
export class PrismaCatechistPresenceRepository extends CatechistPresenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForDate(date: string) {
    return this.prisma.catechistAttendance.findMany({ where: { date } });
  }

  async listForClasses(classIds: string[]) {
    return this.prisma.catechistAttendance.findMany({
      where: { classId: { in: validIds(classIds) } },
    });
  }

  async save(presence: CatechistPresence) {
    const data = {
      status: presence.status,
      recordedBy: presence.recordedBy,
      recordedAt: presence.recordedAt,
    };
    await this.prisma.catechistAttendance.upsert({
      where: { classId_date: { classId: presence.classId, date: presence.date } },
      create: { classId: presence.classId, date: presence.date, ...data },
      update: data,
    });
  }
}

const withSelection = {
  classes: { select: { classId: true } },
  catechumens: { select: { catechumenId: true } },
} as const;

function toCelebration(row: {
  id: string;
  catecheticalYear: string;
  type: SacramentType;
  date: string;
  time: string | null;
  place: string;
  notes: string | null;
  centerId: string;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  classes: { classId: string }[];
  catechumens: { catechumenId: string }[];
}): SacramentCelebration {
  return {
    id: row.id,
    catecheticalYear: row.catecheticalYear,
    type: row.type,
    date: row.date,
    time: orUndefined(row.time),
    place: row.place,
    notes: orUndefined(row.notes),
    centerId: row.centerId,
    selection: {
      classIds: row.classes.map((item) => item.classId).sort(),
      catechumenIds: row.catechumens.map((item) => item.catechumenId).sort(),
    },
    createdAt: row.createdAt,
    createdBy: orUndefined(row.createdBy),
    updatedAt: row.updatedAt,
    updatedBy: orUndefined(row.updatedBy),
    completedAt: orUndefined(row.completedAt),
    completedBy: orUndefined(row.completedBy),
  };
}

function toRecord(row: {
  id: string;
  catechumenId: string;
  type: SacramentType;
  date: string | null;
  parish: string | null;
  celebrationId: string | null;
  recordedAt: Date;
  recordedBy: string | null;
}): SacramentRecord {
  return {
    id: row.id,
    catechumenId: row.catechumenId,
    type: row.type,
    date: orUndefined(row.date),
    parish: orUndefined(row.parish),
    celebrationId: orUndefined(row.celebrationId),
    recordedAt: row.recordedAt,
    recordedBy: orUndefined(row.recordedBy),
  };
}

@Injectable()
export class PrismaSacramentRecordRepository extends SacramentRecordRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForCatechumens(catechumenIds: string[]) {
    const ids = validIds(catechumenIds);
    if (!ids.length) return [];
    return (
      await this.prisma.sacramentRecord.findMany({ where: { catechumenId: { in: ids } } })
    ).map(toRecord);
  }

  async listForCelebration(celebrationId: string) {
    if (!UUID.test(celebrationId)) return [];
    return (await this.prisma.sacramentRecord.findMany({ where: { celebrationId } })).map(toRecord);
  }

  async list(type?: SacramentType) {
    return (await this.prisma.sacramentRecord.findMany({ where: type ? { type } : {} })).map(
      toRecord,
    );
  }

  async save(record: SacramentRecord) {
    const data = {
      date: record.date ?? null,
      parish: record.parish ?? null,
      celebrationId: record.celebrationId ?? null,
      recordedAt: record.recordedAt,
      recordedBy: record.recordedBy ?? null,
    };
    await this.prisma.sacramentRecord.upsert({
      where: { catechumenId_type: { catechumenId: record.catechumenId, type: record.type } },
      create: { id: record.id, catechumenId: record.catechumenId, type: record.type, ...data },
      update: data,
    });
  }

  async delete(catechumenId: string, type: SacramentType) {
    if (!UUID.test(catechumenId)) return;
    await this.prisma.sacramentRecord.deleteMany({ where: { catechumenId, type } });
  }
}

@Injectable()
export class PrismaRollReminderRepository extends RollReminderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(reminder: RollReminder) {
    // Insere só se não existir: com várias instâncias, só uma fica com o alerta.
    const { count } = await this.prisma.rollReminder.createMany({
      data: [{ classId: reminder.classId, date: reminder.date, alertedAt: reminder.alertedAt }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async listForClasses(classIds: string[]) {
    return this.prisma.rollReminder.findMany({ where: { classId: { in: validIds(classIds) } } });
  }
}

@Injectable()
export class PrismaSacramentRepository extends SacramentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listCelebrations(catecheticalYear: string): Promise<SacramentCelebration[]> {
    const rows = await this.prisma.sacramentCelebration.findMany({
      where: { catecheticalYear },
      include: withSelection,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toCelebration);
  }

  async findCelebration(id: string) {
    if (!UUID.test(id)) return null;
    const row = await this.prisma.sacramentCelebration.findUnique({
      where: { id },
      include: withSelection,
    });
    return row ? toCelebration(row) : null;
  }

  async saveCelebration(celebration: SacramentCelebration) {
    const id = celebration.id;
    const data = {
      date: celebration.date,
      time: celebration.time ?? null,
      place: celebration.place,
      notes: celebration.notes ?? null,
      centerId: celebration.centerId,
      updatedAt: celebration.updatedAt,
      updatedBy: celebration.updatedBy ?? null,
      completedAt: celebration.completedAt ?? null,
      completedBy: celebration.completedBy ?? null,
    };
    await this.prisma.$transaction([
      this.prisma.sacramentCelebration.upsert({
        where: { id },
        create: {
          id,
          catecheticalYear: celebration.catecheticalYear,
          type: celebration.type,
          createdAt: celebration.createdAt,
          createdBy: celebration.createdBy ?? null,
          ...data,
        },
        update: data,
      }),
      // A seleção é substituída por inteiro.
      this.prisma.sacramentCelebrationClass.deleteMany({ where: { celebrationId: id } }),
      this.prisma.sacramentCelebrationCatechumen.deleteMany({ where: { celebrationId: id } }),
      this.prisma.sacramentCelebrationClass.createMany({
        data: validIds(celebration.selection.classIds).map((classId) => ({
          celebrationId: id,
          classId,
        })),
      }),
      this.prisma.sacramentCelebrationCatechumen.createMany({
        data: validIds(celebration.selection.catechumenIds).map((catechumenId) => ({
          celebrationId: id,
          catechumenId,
        })),
      }),
    ]);
  }

  async deleteCelebration(id: string) {
    if (!UUID.test(id)) return false;
    const { count } = await this.prisma.sacramentCelebration.deleteMany({ where: { id } });
    return count > 0;
  }

  async listChecks(catechumenIds: string[], sacrament: SacramentType): Promise<RequirementCheck[]> {
    return this.prisma.sacramentRequirementCheck.findMany({
      where: { sacrament, catechumenId: { in: validIds(catechumenIds) } },
    });
  }

  async saveCheck(check: RequirementCheck) {
    const data = { met: check.met, updatedAt: check.updatedAt, updatedBy: check.updatedBy };
    await this.prisma.sacramentRequirementCheck.upsert({
      where: {
        catechumenId_sacrament_requirement: {
          catechumenId: check.catechumenId,
          sacrament: check.sacrament,
          requirement: check.requirement,
        },
      },
      create: {
        catechumenId: check.catechumenId,
        sacrament: check.sacrament,
        requirement: check.requirement,
        ...data,
      },
      update: data,
    });
  }
}

function toAnnouncement(row: {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  authorName: string;
  publishedAt: Date;
  updatedAt: Date;
  createdBy: string;
  centerId: string;
}) {
  return Announcement.restore(
    {
      title: row.title,
      body: row.body,
      audience: row.audience,
      pinned: row.pinned,
      author: row.authorName,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      centerId: row.centerId,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaAnnouncementRepository extends AnnouncementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.announcement.findMany();
    return rows.map(toAnnouncement);
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.announcement.findUnique({ where: { id: id.value } });
    return row ? toAnnouncement(row) : null;
  }

  async save(announcement: Announcement) {
    const data = {
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      pinned: announcement.pinned,
      authorName: announcement.author,
      publishedAt: announcement.publishedAt,
      updatedAt: announcement.updatedAt,
      createdBy: announcement.createdBy,
      centerId: announcement.centerId,
    };
    await this.prisma.announcement.upsert({
      where: { id: announcement.id.value },
      create: { id: announcement.id.value, ...data },
      update: data,
    });
  }

  async delete(id: UniqueId) {
    if (!UUID.test(id.value)) return false;
    const result = await this.prisma.announcement.deleteMany({ where: { id: id.value } });
    return result.count > 0;
  }

  async readCounts(ids: string[]) {
    const valid = validIds(ids);
    const counts = new Map<string, number>();
    if (!valid.length) return counts;
    const groups = await this.prisma.announcementRead.groupBy({
      by: ["announcementId"],
      where: { announcementId: { in: valid } },
      _count: { _all: true },
    });
    for (const group of groups) counts.set(group.announcementId, group._count._all);
    return counts;
  }

  async markRead(announcementIds: string[], accountId: string, at: Date) {
    const ids = validIds(announcementIds);
    if (!ids.length || !UUID.test(accountId)) return;
    await this.prisma.announcementRead.createMany({
      data: ids.map((announcementId) => ({ announcementId, accountId, readAt: at })),
      skipDuplicates: true,
    });
  }
}
