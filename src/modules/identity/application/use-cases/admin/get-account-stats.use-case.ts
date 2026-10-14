import type { UseCase } from "../../../../../shared/application/use-case.js";
import type {
  AccountRepository,
  AccountStats,
} from "../../../domain/repositories/account.repository.js";
import { loadAdministrator } from "./administrator.js";

/** Números das contas para a visão geral da administração. */
export class GetAccountStatsUseCase implements UseCase<{ actorId: string }, AccountStats> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute({ actorId }: { actorId: string }): Promise<AccountStats> {
    await loadAdministrator(this.accounts, actorId);
    return this.accounts.stats();
  }
}
