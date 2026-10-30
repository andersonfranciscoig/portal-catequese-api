import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Center, CenterStatus } from "../center.js";
import type { Announcement } from "../announcement.js";
import type { CalendarActivity } from "../calendar-activity.js";
import type { CatecheticalCalendar } from "../catechetical-calendar.js";
import type { EnrollmentStatus } from "../catechesis.js";
import type { CatechesisClass } from "../catechesis-class.js";
import type { CatechistPresence, CatechistProfile } from "../catechist-records.js";
import type { Catechumen } from "../catechumen.js";
import type { AttendanceEntry, ClassAttendance } from "../class-attendance.js";
import type { Enrollment } from "../enrollment.js";
import type { EnrollmentDocument } from "../enrollment-document.js";
import type { Evaluation } from "../evaluation.js";
import type { RollReminder } from "../roll-deadline.js";
import type { SacramentRecord } from "../sacrament-records.js";
import type { RequirementCheck, SacramentCelebration, SacramentType } from "../sacraments.js";

/*
 * Persistência do módulo da catequese. O domínio e a aplicação só conhecem
 * estes contratos; o Prisma/PostgreSQL é um detalhe da infraestrutura.
 */

export abstract class CenterRepository {
  abstract findById(id: string): Promise<Center | null>;
  abstract list(status?: CenterStatus): Promise<Center[]>;
  abstract save(center: Center): Promise<void>;
}

export abstract class CalendarRepository {
  abstract get(): Promise<CatecheticalCalendar | null>;
  abstract save(calendar: CatecheticalCalendar): Promise<void>;
}

export abstract class CatechumenRepository {
  abstract findById(id: UniqueId): Promise<Catechumen | null>;
  abstract findByIds(ids: string[]): Promise<Catechumen[]>;
  /** Educandos do encarregado e o próprio (adulto). */
  abstract findAccessibleBy(accountId: string): Promise<Catechumen[]>;
  abstract save(catechumen: Catechumen): Promise<void>;
}

export interface EnrollmentQuery {
  catecheticalYear: string;
  status?: EnrollmentStatus;
}

export abstract class EnrollmentRepository {
  abstract findById(id: UniqueId): Promise<Enrollment | null>;
  abstract findForCatechumen(
    catechumenId: string,
    catecheticalYear: string,
  ): Promise<Enrollment | null>;
  /** Todas as matrículas destes catequizandos (todos os anos). */
  abstract listForCatechumens(catechumenIds: string[]): Promise<Enrollment[]>;
  abstract list(query: EnrollmentQuery): Promise<Enrollment[]>;
  /** Matrículas confirmadas numa turma. */
  abstract listConfirmedInClass(classId: string): Promise<Enrollment[]>;
  abstract countConfirmedInClass(classId: string): Promise<number>;
  abstract codeExists(code: string): Promise<boolean>;
  abstract findByCode(code: string): Promise<Enrollment | null>;
  abstract save(enrollment: Enrollment): Promise<void>;
}

export abstract class ClassRepository {
  abstract findById(id: UniqueId): Promise<CatechesisClass | null>;
  abstract findByIds(ids: string[]): Promise<CatechesisClass[]>;
  abstract listByYear(catecheticalYear: string): Promise<CatechesisClass[]>;
  /** Todas as turmas do catequista (todos os anos). */
  abstract listForCatechist(accountId: string): Promise<CatechesisClass[]>;
  /** Anos com turmas (mais recentes primeiro). Com centro, só as desse centro. */
  abstract listYears(centerId?: string): Promise<string[]>;
  /** Turma do catequista no ano (como principal ou auxiliar). */
  abstract findForCatechist(
    accountId: string,
    catecheticalYear: string,
  ): Promise<CatechesisClass | null>;
  abstract exists(
    catecheticalYear: string,
    level: string,
    section: string,
    centerId?: string,
  ): Promise<boolean>;
  abstract save(klass: CatechesisClass): Promise<void>;
}

export abstract class AttendanceRepository {
  /** Chamadas lançadas na turma (uma por dia de encontro). */
  abstract listForClass(classId: string): Promise<ClassAttendance[]>;
  /** Presenças de um catequizando na turma, por data. */
  abstract listForCatechumen(classId: string, catechumenId: string): Promise<AttendanceEntry[]>;
  /** Substitui a chamada desse dia. */
  abstract save(attendance: ClassAttendance): Promise<void>;
  /** Dias com chamada lançada nestas turmas, a partir de `from` (inclusive). */
  abstract listRollDates(
    classIds: string[],
    from: string,
  ): Promise<{ classId: string; date: string }[]>;
}

/** Sacramentos recebidos (um registo por catequizando e tipo). */
export abstract class SacramentRecordRepository {
  abstract listForCatechumens(catechumenIds: string[]): Promise<SacramentRecord[]>;
  abstract listForCelebration(celebrationId: string): Promise<SacramentRecord[]>;
  /** Todos (de um tipo, se indicado). */
  abstract list(type?: SacramentType): Promise<SacramentRecord[]>;
  /** Cria ou substitui o registo desse catequizando e tipo. */
  abstract save(record: SacramentRecord): Promise<void>;
  abstract delete(catechumenId: string, type: SacramentType): Promise<void>;
}

/** Alertas de chamada por lançar já enviados (um por turma e encontro). */
export abstract class RollReminderRepository {
  /**
   * Regista o alerta se ainda não existir. `true` só para quem o registou
   * (com várias instâncias, só uma avisa).
   */
  abstract claim(reminder: RollReminder): Promise<boolean>;
  abstract listForClasses(classIds: string[]): Promise<RollReminder[]>;
}

export abstract class EvaluationRepository {
  abstract listForClass(classId: string): Promise<Evaluation[]>;
  abstract saveMany(evaluations: Evaluation[]): Promise<void>;
}

export abstract class EnrollmentDocumentRepository {
  abstract findById(id: UniqueId): Promise<EnrollmentDocument | null>;
  abstract listForEnrollment(enrollmentId: string): Promise<EnrollmentDocument[]>;
  abstract listForEnrollments(enrollmentIds: string[]): Promise<EnrollmentDocument[]>;
  /**
   * Guarda o documento; se já havia um do mesmo tipo, substitui-o e devolve o
   * anterior (para apagar o ficheiro antigo).
   */
  abstract save(document: EnrollmentDocument): Promise<EnrollmentDocument | null>;
}

export abstract class CatechistProfileRepository {
  abstract list(): Promise<CatechistProfile[]>;
  abstract find(accountId: string): Promise<CatechistProfile | null>;
  abstract save(profile: CatechistProfile): Promise<void>;
}

export abstract class CatechistPresenceRepository {
  abstract listForDate(date: string): Promise<CatechistPresence[]>;
  abstract listForClasses(classIds: string[]): Promise<CatechistPresence[]>;
  abstract save(presence: CatechistPresence): Promise<void>;
}

export abstract class SacramentRepository {
  /** Todas as celebrações do ano (de todos os sacramentos), com a seleção. */
  abstract listCelebrations(catecheticalYear: string): Promise<SacramentCelebration[]>;
  abstract findCelebration(id: string): Promise<SacramentCelebration | null>;
  /** Cria ou substitui (incluindo as turmas e os catequizandos escolhidos). */
  abstract saveCelebration(celebration: SacramentCelebration): Promise<void>;
  /** `false` quando não existia. */
  abstract deleteCelebration(id: string): Promise<boolean>;
  abstract listChecks(
    catechumenIds: string[],
    sacrament: SacramentType,
  ): Promise<RequirementCheck[]>;
  abstract saveCheck(check: RequirementCheck): Promise<void>;
}

export abstract class AnnouncementRepository {
  abstract list(): Promise<Announcement[]>;
  abstract findById(id: UniqueId): Promise<Announcement | null>;
  abstract save(announcement: Announcement): Promise<void>;
  /** `false` quando o aviso não existia. */
  abstract delete(id: UniqueId): Promise<boolean>;
  abstract readCounts(ids: string[]): Promise<Map<string, number>>;
  /** Regista a leitura (uma por conta). Repetir não altera a data. */
  abstract markRead(announcementIds: string[], accountId: string, at: Date): Promise<void>;
}

export abstract class CalendarActivityRepository {
  abstract list(): Promise<CalendarActivity[]>;
  abstract findById(id: UniqueId): Promise<CalendarActivity | null>;
  abstract save(activity: CalendarActivity): Promise<void>;
  abstract delete(id: UniqueId): Promise<boolean>;
}
