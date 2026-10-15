import type { DomainEvent } from "../../../../shared/domain/domain-event.js";
import type { AccountRole } from "../account-role.js";

/** A conta ganhou um papel (ex.: um encarregado passou também a ser catequista). */
export class AccountRoleAdded implements DomainEvent {
  readonly name = "identity.account_role_added";

  constructor(
    readonly aggregateId: string,
    readonly role: AccountRole,
    readonly occurredAt: Date,
  ) {}
}
