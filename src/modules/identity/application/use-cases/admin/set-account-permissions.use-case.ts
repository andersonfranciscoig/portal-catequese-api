import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { Permission } from "../../../domain/account-role.js";
import {
  LastAdministratorError,
  SelfAdministrationError,
} from "../../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget, PERMISSION_LABEL } from "./administrator.js";

export interface SetAccountPermissionsInput {
  actorId: string;
  accountId: string;
  permissions: Permission[];
}

/** Substitui as permissões de uma conta (sem deixar o portal sem administração). */
export class SetAccountPermissionsUseCase implements UseCase<
  SetAccountPermissionsInput,
  AdminAccountView
> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, accountId, permissions }: SetAccountPermissionsInput) {
    const actor = await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    const before = [...account.permissions];

    const losesAdmin =
      before.includes(Permission.SUPER_ADMIN) && !permissions.includes(Permission.SUPER_ADMIN);
    if (losesAdmin) {
      if (account.equals(actor)) {
        throw new SelfAdministrationError("Não pode retirar a sua própria administração.");
      }
      if ((await this.accounts.countActiveSuperAdmins(account.id)) === 0) {
        throw new LastAdministratorError();
      }
    }

    account.setPermissions(permissions, this.clock.now());
    await this.accounts.save(account);

    const after = account.permissions;
    const added = after.filter((item) => !before.includes(item));
    const removed = before.filter((item) => !after.includes(item));
    if (added.length || removed.length) {
      const label = (items: Permission[]) => items.map((item) => PERMISSION_LABEL[item]).join(", ");
      const parts = [
        added.length && `deu ${label(added)}`,
        removed.length && `retirou ${label(removed)}`,
      ].filter(Boolean);
      await this.activity.record({
        actorId,
        category: "ADMIN",
        action: "identity.permissions_changed",
        summary: `Alterou as permissões de ${account.fullName.value}: ${parts.join("; ")}`,
        targetAccountId: account.id.value,
      });
    }
    return toAdminAccountView(account);
  }
}
