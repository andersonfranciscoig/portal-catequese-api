import type { UseCase } from "../../../../../shared/application/use-case.js";
import type {
  AccountQuery,
  AccountRepository,
} from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator } from "./administrator.js";

export interface ListAccountsInput extends AccountQuery {
  actorId: string;
}

export interface AccountPage {
  items: AdminAccountView[];
  total: number;
  page: number;
  pageCount: number;
}

/** Todas as contas do portal, com pesquisa e filtros. */
export class ListAccountsUseCase implements UseCase<ListAccountsInput, AccountPage> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute({ actorId, ...query }: ListAccountsInput): Promise<AccountPage> {
    await loadAdministrator(this.accounts, actorId);
    const { items, total } = await this.accounts.search(query);
    return {
      items: items.map(toAdminAccountView),
      total,
      page: query.page,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}
