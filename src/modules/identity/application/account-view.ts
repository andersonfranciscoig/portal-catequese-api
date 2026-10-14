import type { Account } from "../domain/account.js";
import type {
  AccountApproval,
  AccountRole,
  AccountStatus,
  Permission,
} from "../domain/account-role.js";

/** Conta como é exposta fora do módulo (sem o hash da palavra-passe). */
export interface AccountView {
  id: string;
  role: AccountRole;
  fullName: string;
  phone: string;
  email?: string;
  approval?: AccountApproval;
  /** Permissões efetivas (as que a conta pode usar agora). */
  permissions: Permission[];
  status: AccountStatus;
  blockedReason?: string;
  blockedAt?: string;
  betaAccess: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Na administração mostra-se também o que foi atribuído (mesmo sem efeito agora). */
export interface AdminAccountView extends AccountView {
  assignedPermissions: Permission[];
}

export function toAccountView(account: Account): AccountView {
  return {
    id: account.id.value,
    role: account.role,
    fullName: account.fullName.value,
    phone: account.phone.value,
    email: account.email?.value,
    approval: account.approval,
    permissions: account.effectivePermissions(),
    status: account.status,
    blockedReason: account.blockedReason,
    blockedAt: account.blockedAt?.toISOString(),
    betaAccess: account.betaAccess,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toAdminAccountView(account: Account): AdminAccountView {
  return { ...toAccountView(account), assignedPermissions: [...account.permissions] };
}
