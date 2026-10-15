import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { AccountRole } from "../../../domain/account-role.js";
import { NotACatechistError } from "../../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadCatechistApprover, loadTarget } from "./administrator.js";

export interface DecideCatechistInput {
  actorId: string;
  accountId: string;
  decision: "APPROVED" | "REJECTED";
}

/** Aprova ou recusa uma conta de catequista (administração ou coordenação com a permissão). */
export class DecideCatechistUseCase implements UseCase<DecideCatechistInput, AdminAccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute({ actorId, accountId, decision }: DecideCatechistInput) {
    // A administração ou a coordenação com "aprovar catequistas".
    await loadCatechistApprover(this.accounts, actorId);
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
    await this.notifier.notify(
      decision === "APPROVED"
        ? {
            to: { accountIds: [account.id.value] },
            kind: "identity.catechist_approved",
            title: "O seu pedido para ser catequista foi aceite",
            body:
              account.roles.length > 1
                ? "Já pode usar o portal de catequista: troque de portal no menu da conta."
                : "Já pode usar o portal de catequista.",
            link: "/portal",
            exceptAccountId: actorId,
          }
        : {
            to: { accountIds: [account.id.value] },
            kind: "identity.catechist_rejected",
            title: "O seu pedido para ser catequista não foi aprovado",
            body: "Para saber mais, fale com a coordenação da catequese.",
            link: "/conta",
            exceptAccountId: actorId,
          },
    );
    return toAdminAccountView(account);
  }
}
