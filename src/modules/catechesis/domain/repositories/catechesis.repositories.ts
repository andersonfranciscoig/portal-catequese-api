import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { CatecheticalCalendar } from "../catechetical-calendar.js";
import type { EnrollmentStatus } from "../catechesis.js";
import type { CatechesisClass } from "../catechesis-class.js";
import type { Catechumen } from "../catechumen.js";
import type { AttendanceEntry, ClassAttendance } from "../class-attendance.js";
import type { Enrollment } from "../enrollment.js";
import type { Evaluation } from "../evaluation.js";

/*
 * Persistência do módulo da catequese. O domínio e a aplicação só conhecem
 * estes contratos; o Prisma/PostgreSQL é um detalhe da infraestrutura.
 */

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
  abstract save(enrollment: Enrollment): Promise<void>;
}

export abstract class ClassRepository {
  abstract findById(id: UniqueId): Promise<CatechesisClass | null>;
  abstract findByIds(ids: string[]): Promise<CatechesisClass[]>;
  abstract listByYear(catecheticalYear: string): Promise<CatechesisClass[]>;
  /** Turma do catequista no ano (como principal ou auxiliar). */
  abstract findForCatechist(
    accountId: string,
    catecheticalYear: string,
  ): Promise<CatechesisClass | null>;
  abstract exists(catecheticalYear: string, level: string, section: string): Promise<boolean>;
  abstract save(klass: CatechesisClass): Promise<void>;
}

export abstract class AttendanceRepository {
  /** Chamadas lançadas na turma (uma por dia de encontro). */
  abstract listForClass(classId: string): Promise<ClassAttendance[]>;
  /** Presenças de um catequizando na turma, por data. */
  abstract listForCatechumen(classId: string, catechumenId: string): Promise<AttendanceEntry[]>;
  /** Substitui a chamada desse dia. */
  abstract save(attendance: ClassAttendance): Promise<void>;
}

export abstract class EvaluationRepository {
  abstract listForClass(classId: string): Promise<Evaluation[]>;
  abstract saveMany(evaluations: Evaluation[]): Promise<void>;
}
