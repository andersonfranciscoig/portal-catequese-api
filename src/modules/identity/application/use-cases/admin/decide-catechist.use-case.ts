import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { AccountRole } from "../../../domain/account-role.js";
import { NotACatechistError } from "../../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget } from "./administrator.js";

export interface DecideCatechistInput {
  actorId: string;
  accountId: string;
  decision: "APPROVED" | "REJECTED";
}

/** Aprova ou recusa uma conta de catequista. */
export class DecideCatechistUseCase implements UseCase<DecideCatechistInput, AdminAccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, accountId, decision }: DecideCatechistInput) {
    await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    if (!account.hasRole(AccountRole.CATECHIST)) throw new NotACatechistError();

    const now = this.clock.now();
    if (decision === "APPROVED") account.approve(now);
    else account.reject(now);
    await this.accounts.save(account);
    await this.activity.record({
      actorId,
      category: "CATECHISTS",
      action:
        decision === "APPROVED" ? "identity.catechist_approved" : "identity.catechist_rejected",
      summary: `${decision === "APPROVED" ? "Aprovou" : "Recusou"} a conta de catequista de ${account.fullName.value}`,
      targetAccountId: account.id.value,
    });
    return toAdminAccountView(account);
  }
}
