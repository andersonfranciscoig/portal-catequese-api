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
  "Esta ação não está disponível no estado atual da matrícula.",
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

export class DocumentNotFoundError extends error(
  "not_found",
  "document_not_found",
  "Documento não encontrado.",
) {}
export class ConfirmationNotAllowedError extends error("validation", "confirmation_not_allowed") {}
export class DeadlineClosedError extends error("forbidden", "deadline_closed") {}

export class InvalidSacramentError extends error("validation", "invalid_sacrament") {}
export class SacramentCandidateNotFoundError extends error(
  "not_found",
  "sacrament_candidate_not_found",
  "Este catequizando não é candidato a esta celebração no ano em curso.",
) {}
export class InvalidAnnouncementError extends error("validation", "invalid_announcement") {}
export class InvalidCalendarActivityError extends error("validation", "invalid_calendar_activity") {}
export class CalendarActivityNotFoundError extends error(
  "not_found",
  "calendar_activity_not_found",
  "Atividade não encontrada.",
) {}
export class AnnouncementNotFoundError extends error(
  "not_found",
  "announcement_not_found",
  "Aviso não encontrado.",
) {}
export class AnnouncementRoleError extends error(
  "forbidden",
  "announcement_role",
  "Esta conta não tem o papel pedido.",
) {}

export class ReportNotAllowedError extends error(
  "forbidden",
  "report_not_allowed",
  "Os pagamentos só estão disponíveis para quem tem acesso ao financeiro.",
) {}
