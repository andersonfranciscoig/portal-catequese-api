import { DomainError, type DomainErrorKind } from "../../../../shared/domain/domain-error.js";

/** Erro de domínio da catequese com o tipo, o código e a mensagem para mostrar. */
function error(kind: DomainErrorKind, code: string, fallback?: string) {
  return class extends DomainError {
    readonly kind = kind;
    readonly code = `catechesis.${code}`;
    constructor(message = fallback ?? "") {
      super(message);
    }
  };
}

export class InvalidCalendarError extends error("validation", "invalid_calendar") {}
export class CalendarNotDefinedError extends error(
  "not_found",
  "calendar_not_defined",
  "O ano catequético ainda não foi definido pela coordenação.",
) {}

export class InvalidCatechumenError extends error("validation", "invalid_catechumen") {}
export class CatechumenNotFoundError extends error(
  "not_found",
  "catechumen_not_found",
  "Catequizando não encontrado.",
) {}

export class InvalidEnrollmentError extends error("validation", "invalid_enrollment") {}
export class EnrollmentNotFoundError extends error(
  "not_found",
  "enrollment_not_found",
  "Matrícula não encontrada.",
) {}
export class EnrollmentAlreadyExistsError extends error(
  "conflict",
  "enrollment_already_exists",
  "Já existe uma matrícula para este catequizando neste ano catequético.",
) {}
export class EnrollmentAlreadyDecidedError extends error(
  "conflict",
  "enrollment_already_decided",
  "Esta matrícula já foi decidida.",
) {}
export class NotAnApplicantError extends error(
  "forbidden",
  "not_an_applicant",
  "Só um encarregado de educação ou um adulto inscrito pode fazer matrículas.",
) {}

export class InvalidClassError extends error("validation", "invalid_class") {}
export class ClassNotFoundError extends error(
  "not_found",
  "class_not_found",
  "Turma não encontrada.",
) {}
export class ClassAlreadyExistsError extends error(
  "conflict",
  "class_already_exists",
  "Já existe uma turma com este nível e esta letra neste ano.",
) {}
export class ClassFullError extends error("conflict", "class_full", "A turma está completa.") {}

export class NotAnApprovedCatechistError extends error(
  "forbidden",
  "not_an_approved_catechist",
  "Esta área é só para catequistas aprovados pela coordenação.",
) {}
export class NoClassAssignedError extends error(
  "not_found",
  "no_class_assigned",
  "Ainda não tem turma atribuída neste ano.",
) {}
export class InvalidSessionDateError extends error("validation", "invalid_session_date") {}
export class NotAClassMemberError extends error(
  "validation",
  "not_a_class_member",
  "Há catequizandos que não pertencem a esta turma.",
) {}
export class InvalidEvaluationError extends error("validation", "invalid_evaluation") {}
