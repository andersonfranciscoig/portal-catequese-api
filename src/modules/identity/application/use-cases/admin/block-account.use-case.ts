import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import {
  LastAdministratorError,
  SelfAdministrationError,
} from "../../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import type { SessionRepository } from "../../../domain/repositories/session.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget } from "./administrator.js";

export interface BlockAccountInput {
  actorId: string;
  accountId: string;
  reason: string;
}

/** Bloqueia a conta e termina todas as suas sessões. */
export class BlockAccountUseCase implements UseCase<BlockAccountInput, AdminAccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, accountId, reason }: BlockAccountInput) {
    const actor = await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    if (account.equals(actor)) {
      throw new SelfAdministrationError("Não pode bloquear a sua própria conta.");
    }
    if (account.isSuperAdmin && (await this.accounts.countActiveSuperAdmins(account.id)) === 0) {
      throw new LastAdministratorError();
    }

    const now = this.clock.now();
    account.block(reason.trim(), now);
    await this.accounts.save(account);
    await this.sessions.revokeAllForAccount(account.id, now);
    await this.activity.record({
      actorId,
      category: "ADMIN",
      action: "identity.account_blocked",
      summary: `Bloqueou a conta de ${account.fullName.value}: ${reason.trim()}`,
      targetAccountId: account.id.value,
    });
    return toAdminAccountView(account);
  }
}
