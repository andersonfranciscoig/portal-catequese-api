import type { DomainEvent } from "../../../../shared/domain/domain-event.js";
import type { AccountRole } from "../account-role.js";

export class AccountRegistered implements DomainEvent {
  readonly name = "identity.account_registered";

  constructor(
    readonly aggregateId: string,
    readonly roles: AccountRole[],
    readonly occurredAt: Date,
  ) {}
}
