import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget } from "./administrator.js";

export class UnblockAccountUseCase implements UseCase<
  { actorId: string; accountId: string },
  AdminAccountView
> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute({ actorId, accountId }: { actorId: string; accountId: string }) {
    await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    account.unblock(this.clock.now());
    await this.accounts.save(account);
    await this.activity.record({
      actorId,
      category: "ADMIN",
      action: "identity.account_unblocked",
      summary: `Desbloqueou a conta de ${account.fullName.value}`,
      targetAccountId: account.id.value,
    });
    await this.notifier.notify({
      to: { accountIds: [account.id.value] },
      kind: "identity.account_unblocked",
      title: "A sua conta foi desbloqueada",
      body: "Já pode voltar a usar o portal.",
      link: "/portal",
      exceptAccountId: actorId,
    });
    return toAdminAccountView(account);
  }
}
