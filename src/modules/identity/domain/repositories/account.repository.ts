import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Account } from "../account.js";
import type { AccountRole, Permission } from "../account-role.js";
import type { Email } from "../value-objects/email.js";
import type { PhoneNumber } from "../value-objects/phone-number.js";

export interface AccountQuery {
  /** Nome, email ou telefone. */
  search?: string;
  role?: AccountRole;
  status?: "active" | "blocked" | "pending_approval";
  access?: "coordination" | "admin" | "beta";
  page: number;
  pageSize: number;
}

export interface AccountStats {
  total: number;
  blocked: number;
  pendingCatechists: number;
  coordination: number;
  admins: number;
  testers: number;
}

/**
 * Persistência das contas. O domínio só conhece este contrato; a base de dados
 * (Prisma/PostgreSQL hoje) é um detalhe da infraestrutura.
 */
export abstract class AccountRepository {
  abstract findById(id: UniqueId): Promise<Account | null>;
  /** As que existirem (ids desconhecidos ficam de fora). */
  abstract findByIds(ids: UniqueId[]): Promise<Account[]>;
  abstract findByEmail(email: Email): Promise<Account | null>;
  abstract findByPhone(phone: PhoneNumber): Promise<Account | null>;
  abstract save(account: Account): Promise<void>;
  /** Pesquisa paginada (administração), por nome. */
  abstract search(query: AccountQuery): Promise<{ items: Account[]; total: number }>;
  abstract stats(): Promise<AccountStats>;
  /** Contas ativas com alguma destas permissões atribuídas (candidatas a notificações). */
  abstract findActiveWithAnyPermission(permissions: Permission[]): Promise<Account[]>;
  /** Contas de administração geral ativas, exceto `exceptId`. */
  abstract countActiveSuperAdmins(exceptId: UniqueId): Promise<number>;
}
