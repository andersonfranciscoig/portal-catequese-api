import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget } from "./administrator.js";

export class GetAccountUseCase implements UseCase<
  { actorId: string; accountId: string },
  AdminAccountView
> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute({ actorId, accountId }: { actorId: string; accountId: string }) {
    await loadAdministrator(this.accounts, actorId);
    return toAdminAccountView(await loadTarget(this.accounts, accountId));
  }
}
