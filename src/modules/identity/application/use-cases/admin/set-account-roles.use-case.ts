import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { EventBus } from "../../../../../shared/application/event-bus.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { AccountRole } from "../../../domain/account-role.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget } from "./administrator.js";

export interface SetAccountRolesInput {
  actorId: string;
  accountId: string;
  roles: AccountRole[];
}

export const ROLE_LABEL: Record<AccountRole, string> = {
  GUARDIAN: "Encarregado de educação",
  CATECHUMEN: "Catecúmeno adulto",
  CATECHIST: "Catequista",
};

/** A administração define os papéis de uma conta (catequista acrescentado já aprovado). */
export class SetAccountRolesUseCase implements UseCase<SetAccountRolesInput, AdminAccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly events: EventBus,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, accountId, roles }: SetAccountRolesInput) {
    await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    const before = [...account.roles];
    account.setRoles(roles, this.clock.now());
    await this.accounts.save(account);
    await this.events.publish(account.pullEvents());

    const after = account.roles;
    const added = after.filter((role) => !before.includes(role));
    const removed = before.filter((role) => !after.includes(role));
    if (added.length || removed.length) {
      const label = (items: AccountRole[]) => items.map((role) => ROLE_LABEL[role]).join(", ");
      const parts = [
        added.length && `acrescentou ${label(added)}`,
        removed.length && `retirou ${label(removed)}`,
      ].filter(Boolean);
      await this.activity.record({
        actorId,
        category: "ADMIN",
        action: "identity.roles_changed",
        summary: `Alterou os papéis de ${account.fullName.value}: ${parts.join("; ")}`,
        targetAccountId: account.id.value,
      });
    }
    return toAdminAccountView(account);
  }
}
