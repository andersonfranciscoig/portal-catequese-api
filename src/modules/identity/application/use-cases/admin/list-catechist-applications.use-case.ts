import type { UseCase } from "../../../../../shared/application/use-case.js";
import { AccountRole } from "../../../domain/account-role.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadCatechistApprover } from "./administrator.js";

/** Contas de catequista por aprovar (para quem aprova catequistas). */
export class ListCatechistApplicationsUseCase implements UseCase<
  { actorId: string },
  AdminAccountView[]
> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute({ actorId }: { actorId: string }): Promise<AdminAccountView[]> {
    await loadCatechistApprover(this.accounts, actorId);
    const { items } = await this.accounts.search({
      role: AccountRole.CATECHIST,
      status: "pending_approval",
      page: 1,
      pageSize: 100,
    });
    return items.map(toAdminAccountView);
  }
}
