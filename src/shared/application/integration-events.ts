import type { DomainEvent } from "../domain/domain-event.js";

/**
 * Eventos trocados entre módulos (o contrato, não a implementação). Quem publica
 * e quem subscreve dependem só daqui — nunca um do outro.
 */
export const ACCESS_REQUEST_APPROVED = "platform.access_request_approved";

/** Um pedido de acesso à fase de testes foi aceite. */
export interface AccessRequestApprovedEvent extends DomainEvent {
  readonly name: typeof ACCESS_REQUEST_APPROVED;
  /** E.164 */
  readonly phone: string;
  readonly email?: string;
}

export const ENROLLMENT_SUBMITTED = "catechesis.enrollment_submitted";

/**
 * Uma matrícula nova ou a confirmação de um ano foi submetida. O módulo dos
 * pagamentos subscreve-o para criar a taxa a pagar.
 */
export interface EnrollmentSubmittedEvent extends DomainEvent {
  readonly name: typeof ENROLLMENT_SUBMITTED;
  readonly enrollmentCode: string;
  readonly catechumenName: string;
  /** Matrícula nova ou confirmação (preços diferentes). */
  readonly purpose: "ENROLLMENT" | "CONFIRMATION";
  /** Quem paga e acompanha: o encarregado e/ou o próprio adulto. */
  readonly payerAccountIds: string[];
  /** Centro da matrícula (o pagamento fica nesse centro). */
  readonly centerId: string;
}
