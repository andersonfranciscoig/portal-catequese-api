import {
  ACCESS_REQUEST_APPROVED,
  type AccessRequestApprovedEvent,
} from "../../../../shared/application/integration-events.js";

/**
 * Um pedido de acesso à fase de testes foi aceite. O módulo de identidade
 * subscreve-o para dar acesso às contas que já existam com este contacto.
 */
export class AccessRequestApproved implements AccessRequestApprovedEvent {
  readonly name = ACCESS_REQUEST_APPROVED;

  constructor(
    readonly aggregateId: string,
    readonly phone: string,
    readonly email: string | undefined,
    readonly occurredAt: Date,
  ) {}
}
