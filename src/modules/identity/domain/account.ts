import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import {
  ALL_PERMISSIONS,
  AccountApproval,
  AccountRole,
  AccountStatus,
  COORDINATION_PERMISSIONS,
  Permission,
} from "./account-role.js";
import { AccountRegistered } from "./events/account-registered.js";
import type { Email } from "./value-objects/email.js";
import type { FullName } from "./value-objects/full-name.js";
import type { PhoneNumber } from "./value-objects/phone-number.js";

export interface AccountProps {
  role: AccountRole;
  fullName: FullName;
  phone: PhoneNumber;
  email?: Email;
  /** Hash da palavra-passe (nunca a palavra-passe em claro). */
  passwordHash: string;
  /** Só contas de catequista. */
  approval?: AccountApproval;
  permissions: Permission[];
  status: AccountStatus;
  blockedReason?: string;
  blockedAt?: Date;
  /** Fase de lançamento: aceite como testadora pela administração. */
  betaAccess: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterAccountProps {
  role: AccountRole;
  fullName: FullName;
  phone: PhoneNumber;
  email?: Email;
  passwordHash: string;
  /** O pedido de acesso à fase de testes foi aceite. */
  betaAccess?: boolean;
  /** Permissões iniciais (ex.: a primeira conta de administração). */
  permissions?: Permission[];
  now: Date;
}

/** Conta de acesso ao portal (agregado do módulo de identidade). */
export class Account extends AggregateRoot<AccountProps> {
  static register({ now, betaAccess, permissions, ...props }: RegisterAccountProps): Account {
    const account = new Account({
      ...props,
      // A conta de catequista fica pendente até a coordenação aprovar.
      approval: props.role === AccountRole.CATECHIST ? AccountApproval.PENDING : undefined,
      permissions: normalizePermissions(permissions ?? []),
      status: AccountStatus.ACTIVE,
      betaAccess: betaAccess ?? false,
      createdAt: now,
      updatedAt: now,
    });
    account.record(new AccountRegistered(account.id.value, account.role, now));
    return account;
  }

  /** Reconstrói uma conta já existente (ex.: a partir da base de dados). */
  static restore(props: AccountProps, id: UniqueId): Account {
    return new Account({ ...props, permissions: [...props.permissions] }, id);
  }

  get role() {
    return this.props.role;
  }
  get fullName() {
    return this.props.fullName;
  }
  get phone() {
    return this.props.phone;
  }
  get email() {
    return this.props.email;
  }
  get passwordHash() {
    return this.props.passwordHash;
  }
  get approval() {
    return this.props.approval;
  }
  /** Permissões atribuídas (podem não estar todas em vigor — ver `effectivePermissions`). */
  get permissions(): readonly Permission[] {
    return this.props.permissions;
  }
  get status() {
    return this.props.status;
  }
  get blockedReason() {
    return this.props.blockedReason;
  }
  get blockedAt() {
    return this.props.blockedAt;
  }
  get betaAccess() {
    return this.props.betaAccess;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  get isBlocked(): boolean {
    return this.props.status === AccountStatus.BLOCKED;
  }

  /** Administração geral (e não bloqueada). */
  get isSuperAdmin(): boolean {
    return !this.isBlocked && this.props.permissions.includes(Permission.SUPER_ADMIN);
  }

  /**
   * Regras: conta bloqueada não tem permissões; o super admin tem todas; um
   * catequista por aprovar não usa permissões; financeiro, fora de prazo e
   * aprovações só valem com acesso à coordenação.
   */
  hasPermission(permission: Permission): boolean {
    if (this.isBlocked) return false;
    if (this.props.permissions.includes(Permission.SUPER_ADMIN)) return true;
    if (this.role === AccountRole.CATECHIST && this.approval !== AccountApproval.APPROVED) {
      return false;
    }
    if (!this.props.permissions.includes(permission)) return false;
    return (
      !COORDINATION_PERMISSIONS.includes(permission) ||
      this.props.permissions.includes(Permission.COORDINATION)
    );
  }

  /** Permissões que de facto se aplicam agora (as que vão no token de acesso). */
  effectivePermissions(): Permission[] {
    return ALL_PERMISSIONS.filter((permission) => this.hasPermission(permission));
  }

  /** Substitui as permissões (as da coordenação caem se a coordenação sair). */
  setPermissions(permissions: Permission[], now: Date): void {
    this.props.permissions = normalizePermissions(permissions);
    this.props.updatedAt = now;
  }

  block(reason: string, now: Date): void {
    this.props.status = AccountStatus.BLOCKED;
    this.props.blockedReason = reason;
    this.props.blockedAt = now;
    this.props.updatedAt = now;
  }

  unblock(now: Date): void {
    this.props.status = AccountStatus.ACTIVE;
    this.props.blockedReason = undefined;
    this.props.blockedAt = undefined;
    this.props.updatedAt = now;
  }

  setBetaAccess(betaAccess: boolean, now: Date): void {
    this.props.betaAccess = betaAccess;
    this.props.updatedAt = now;
  }

  approve(now: Date): void {
    if (this.role !== AccountRole.CATECHIST) return;
    this.props.approval = AccountApproval.APPROVED;
    this.props.updatedAt = now;
  }

  reject(now: Date): void {
    if (this.role !== AccountRole.CATECHIST) return;
    this.props.approval = AccountApproval.REJECTED;
    this.props.updatedAt = now;
  }

  /** O próprio altera os seus dados. */
  updateProfile(
    { fullName, phone, email }: { fullName: FullName; phone: PhoneNumber; email?: Email },
    now: Date,
  ): void {
    this.props.fullName = fullName;
    this.props.phone = phone;
    this.props.email = email;
    this.props.updatedAt = now;
  }

  changePassword(passwordHash: string, now: Date): void {
    this.props.passwordHash = passwordHash;
    this.props.updatedAt = now;
  }
}

function normalizePermissions(permissions: Permission[]): Permission[] {
  const unique = [...new Set(permissions)];
  return unique.includes(Permission.COORDINATION)
    ? unique
    : unique.filter((permission) => !COORDINATION_PERMISSIONS.includes(permission));
}
