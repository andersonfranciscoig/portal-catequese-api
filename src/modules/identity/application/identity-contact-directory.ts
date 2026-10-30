import {
  ContactDirectory,
  type ContactPerson,
} from "../../../shared/application/contact-directory.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import type { Account } from "../domain/account.js";
import { Permission } from "../domain/account-role.js";
import type { AccountRepository } from "../domain/repositories/account.repository.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toContact(account: Account): ContactPerson {
  return {
    id: account.id.value,
    fullName: account.fullName.value,
    roles: [...account.roles],
    staff: account.isSuperAdmin
      ? "ADMIN"
      : account.hasPermission(Permission.COORDINATION)
        ? "COORDINATION"
        : null,
    active: !account.isBlocked,
  };
}

/** Implementação do contrato partilhado `ContactDirectory` com as contas deste módulo. */
export class IdentityContactDirectory extends ContactDirectory {
  constructor(private readonly accounts: AccountRepository) {
    super();
  }

  async findMany(ids: string[]) {
    const unique = [...new Set(ids)].filter((id) => UUID.test(id));
    if (!unique.length) return [];
    return (await this.accounts.findByIds(unique.map((id) => UniqueId.from(id)))).map(toContact);
  }

  async staffIds() {
    const candidates = await this.accounts.findActiveWithAnyPermission([
      Permission.SUPER_ADMIN,
      Permission.COORDINATION,
    ]);
    return candidates
      .map(toContact)
      .filter((person) => person.active && person.staff)
      .map((person) => person.id);
  }

  async search(term: string | undefined, limit: number) {
    const { items } = await this.accounts.search({
      search: term?.trim() || undefined,
      status: "active",
      page: 1,
      pageSize: limit,
    });
    return items.map(toContact);
  }
}
