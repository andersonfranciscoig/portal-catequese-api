import { UniqueId } from "../../../shared/domain/unique-id.js";
import type { AccountRepository } from "../domain/repositories/account.repository.js";

/** Consulta pública do módulo: nomes das contas (ex.: para o registo de atividade). */
export class AccountDirectoryService {
  constructor(private readonly accounts: AccountRepository) {}

  async namesFor(accountIds: string[]): Promise<Record<string, string>> {
    const accounts = await Promise.all(
      accountIds.map((id) => this.accounts.findById(UniqueId.from(id)).catch(() => null)),
    );
    return Object.fromEntries(
      accounts.filter((item) => item !== null).map((item) => [item.id.value, item.fullName.value]),
    );
  }
}
