import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Account } from "../../../domain/account.js";
import {
  AccountRepository,
  type AccountQuery,
  type AccountStats,
} from "../../../domain/repositories/account.repository.js";
import type { Email } from "../../../domain/value-objects/email.js";
import type { PhoneNumber } from "../../../domain/value-objects/phone-number.js";

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Repositório em memória: testes e desenvolvimento sem base de dados. */
export class InMemoryAccountRepository extends AccountRepository {
  readonly items = new Map<string, Account>();

  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }

  async findByEmail(email: Email) {
    return [...this.items.values()].find((item) => item.email?.equals(email)) ?? null;
  }

  async findByPhone(phone: PhoneNumber) {
    return [...this.items.values()].find((item) => item.phone.equals(phone)) ?? null;
  }

  async save(account: Account) {
    this.items.set(account.id.value, account);
  }

  async search(query: AccountQuery) {
    const search = normalize(query.search?.trim() ?? "");
    const digits = (query.search ?? "").replace(/\D/g, "");
    const filtered = [...this.items.values()]
      .filter((account) => {
        if (
          search &&
          !normalize(`${account.fullName.value} ${account.email?.value ?? ""}`).includes(search) &&
          !(digits.length >= 3 && account.phone.value.includes(digits))
        ) {
          return false;
        }
        if (query.role && !account.hasRole(query.role)) return false;
        if (query.status === "active" && account.isBlocked) return false;
        if (query.status === "blocked" && !account.isBlocked) return false;
        if (query.status === "pending_approval" && account.approval !== "PENDING") return false;
        if (query.access === "admin" && !account.permissions.includes("SUPER_ADMIN")) return false;
        if (query.access === "coordination" && !account.permissions.includes("COORDINATION")) {
          return false;
        }
        if (query.access === "beta" && !account.betaAccess) return false;
        return true;
      })
      .sort((a, b) => a.fullName.value.localeCompare(b.fullName.value, "pt"));
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), total: filtered.length };
  }

  async stats(): Promise<AccountStats> {
    const all = [...this.items.values()];
    return {
      total: all.length,
      blocked: all.filter((item) => item.isBlocked).length,
      pendingCatechists: all.filter((item) => item.approval === "PENDING").length,
      coordination: all.filter((item) => item.permissions.includes("COORDINATION")).length,
      admins: all.filter((item) => item.isSuperAdmin).length,
      testers: all.filter((item) => item.betaAccess).length,
    };
  }

  async countActiveSuperAdmins(exceptId: UniqueId) {
    return [...this.items.values()].filter((item) => item.isSuperAdmin && !item.id.equals(exceptId))
      .length;
  }
}
