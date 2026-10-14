import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../shared/application/notifier.js";
import type { EventBus } from "../../../../shared/application/event-bus.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { AccountRole } from "../../domain/account-role.js";
import { AccountNotFoundError } from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import { toAccountView, type AccountView } from "../account-view.js";

export interface AddOwnRoleInput {
  accountId: string;
  role: AccountRole;
}

const SUMMARY: Record<AccountRole, string> = {
  GUARDIAN: "Passou também a ser encarregado de educação",
  CATECHUMEN: "Passou também a fazer a catequese (catecúmeno adulto)",
  CATECHIST: "Pediu para ser também catequista (por aprovar)",
};

/**
 * O próprio acrescenta um papel à conta: um catequista que é encarregado, ou um
 * encarregado que é catequista. Ser catequista fica por aprovar.
 */
export class AddOwnRoleUseCase implements UseCase<AddOwnRoleInput, AccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly events: EventBus,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute({ accountId, role }: AddOwnRoleInput): Promise<AccountView> {
    const account = await this.accounts.findById(UniqueId.from(accountId));
    if (!account) throw new AccountNotFoundError();
    account.addRole(role, this.clock.now());
    await this.accounts.save(account);
    await this.events.publish(account.pullEvents());
    await this.activity.record({
      actorId: account.id.value,
      category: role === AccountRole.CATECHIST ? "CATECHISTS" : "AUTH",
      action: "identity.role_added",
      summary: SUMMARY[role],
    });
    if (role === AccountRole.CATECHIST) {
      await this.notifier.notify({
        to: { permission: "APPROVE_CATECHISTS" },
        kind: "identity.catechist_requested",
        title: "Novo pedido de catequista",
        body: `${account.fullName.value} pediu para ser também catequista.`,
        link: "/dashboard/catequistas",
        exceptAccountId: account.id.value,
      });
    }
    return toAccountView(account);
  }
}
