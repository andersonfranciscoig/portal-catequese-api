import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Account } from "../../../domain/account.js";
import type { Permission } from "../../../domain/account-role.js";
import {
  AccountNotFoundError,
  NotAdministratorError,
} from "../../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";

export const PERMISSION_LABEL: Record<Permission, string> = {
  SUPER_ADMIN: "Administração geral",
  COORDINATION: "Área da coordenação",
  FINANCE: "Menu financeiro",
  LATE_ENROLLMENT: "Inscrições fora do prazo",
  APPROVE_CATECHISTS: "Aprovar catequistas",
};

/**
 * Confirma, na base de dados, que quem pede é administração geral ativa — o
 * token pode estar desatualizado (ex.: a permissão foi retirada há minutos).
 */
export async function loadAdministrator(
  accounts: AccountRepository,
  actorId: string,
): Promise<Account> {
  const actor = await accounts.findById(UniqueId.from(actorId));
  if (!actor?.isSuperAdmin) throw new NotAdministratorError();
  return actor;
}

export async function loadTarget(accounts: AccountRepository, id: string): Promise<Account> {
  const account = await accounts.findById(UniqueId.from(id));
  if (!account) throw new AccountNotFoundError();
  return account;
}
