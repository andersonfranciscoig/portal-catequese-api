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
