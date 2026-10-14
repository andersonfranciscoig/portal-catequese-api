import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget } from "./administrator.js";

export interface SetBetaAccessInput {
  actorId: string;
  accountId: string;
  betaAccess: boolean;
}

/** Dá ou retira a uma conta o acesso durante a fase de testes. */
export class SetBetaAccessUseCase implements UseCase<SetBetaAccessInput, AdminAccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, accountId, betaAccess }: SetBetaAccessInput) {
    await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    account.setBetaAccess(betaAccess, this.clock.now());
    await this.accounts.save(account);
    await this.activity.record({
      actorId,
      category: "ADMIN",
      action: betaAccess ? "identity.beta_access_granted" : "identity.beta_access_revoked",
      summary: `${betaAccess ? "Deu" : "Retirou"} acesso à fase de testes a ${account.fullName.value}`,
      targetAccountId: account.id.value,
    });
    return toAdminAccountView(account);
  }
}
