import type { NotifiedPermission } from "../../../shared/application/notifier.js";
import {
  PeopleDirectory,
  type PersonSnapshot,
} from "../../../shared/application/people-directory.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import type { Account } from "../domain/account.js";
import { AccountApproval, AccountRole, Permission } from "../domain/account-role.js";
import type { AccountRepository } from "../domain/repositories/account.repository.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSnapshot(account: Account): PersonSnapshot {
  return {
    id: account.id.value,
    fullName: account.fullName.value,
    phone: account.phone.value,
    email: account.email?.value,
    roles: [...account.roles],
    approvedCatechist:
      account.hasRole(AccountRole.CATECHIST) && account.approval === AccountApproval.APPROVED,
    active: !account.isBlocked,
    catechistApproval: account.hasRole(AccountRole.CATECHIST) ? account.approval : undefined,
    createdAt: account.createdAt.toISOString(),
    centerId: account.centerId,
  };
}

/** Implementação do contrato partilhado `PeopleDirectory` com as contas deste módulo. */
export class IdentityPeopleDirectory extends PeopleDirectory {
  constructor(private readonly accounts: AccountRepository) {
    super();
  }

  async find(id: string) {
    if (!UUID.test(id)) return null;
    const account = await this.accounts.findById(UniqueId.from(id));
    return account ? toSnapshot(account) : null;
  }

  async findMany(ids: string[]) {
    const unique = [...new Set(ids)].filter((id) => UUID.test(id));
    const found = new Map(
      (await this.accounts.findByIds(unique.map((id) => UniqueId.from(id)))).map((account) => [
        account.id.value,
        toSnapshot(account),
      ]),
    );
    return unique.flatMap((id) => found.get(id) ?? []);
  }

  async listCatechists() {
    return (await this.accounts.findByRole(AccountRole.CATECHIST)).map(toSnapshot);
  }

  async listByRoles(roles: PersonSnapshot["roles"][number][]) {
    const found = new Map<string, PersonSnapshot>();
    for (const role of roles) {
      for (const account of await this.accounts.findByRole(role)) {
        if (account.isBlocked || found.has(account.id.value)) continue;
        found.set(account.id.value, toSnapshot(account));
      }
    }
    return [...found.values()];
  }

  async idsWithPermission(permission: NotifiedPermission) {
    // As candidatas têm a permissão ou são administração geral; o domínio decide
    // se está em vigor (ex.: aprovar catequistas exige também a coordenação).
    const candidates = await this.accounts.findActiveWithAnyPermission([
      Permission.SUPER_ADMIN,
      permission,
    ]);
    return candidates
      .filter((account) => account.hasPermission(permission))
      .map((account) => account.id.value);
  }

  async coordinationOfCenter(centerId: string) {
    const candidates = await this.accounts.findActiveWithAnyPermission([
      Permission.SUPER_ADMIN,
      Permission.COORDINATION,
    ]);
    return candidates
      .filter(
        (account) =>
          account.hasPermission(Permission.COORDINATION) &&
          (account.hasPermission(Permission.GENERAL_COORDINATION) ||
            account.coordinationCenterId === centerId),
      )
      .map((account) => account.id.value);
  }
}
