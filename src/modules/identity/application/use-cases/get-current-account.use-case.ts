import type { UseCase } from "../../../../shared/application/use-case.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { AccountNotFoundError } from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import { toAccountView, type AccountView } from "../account-view.js";

export interface GetCurrentAccountInput {
  accountId: string;
}

export class GetCurrentAccountUseCase implements UseCase<GetCurrentAccountInput, AccountView> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute({ accountId }: GetCurrentAccountInput): Promise<AccountView> {
    const account = await this.accounts.findById(UniqueId.from(accountId));
    if (!account) throw new AccountNotFoundError();
    return toAccountView(account);
  }
}
