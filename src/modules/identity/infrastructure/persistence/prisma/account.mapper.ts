import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Account as AccountRow } from "../../../../../shared/infrastructure/database/generated/client.js";
import { Account } from "../../../domain/account.js";
import { Email } from "../../../domain/value-objects/email.js";
import { FullName } from "../../../domain/value-objects/full-name.js";
import { PhoneNumber } from "../../../domain/value-objects/phone-number.js";

/** Converte entre o agregado e a linha da tabela `identity.accounts`. */
export const AccountMapper = {
  toDomain(row: AccountRow): Account {
    return Account.restore(
      {
        roles: row.roles,
        fullName: FullName.restore(row.fullName),
        phone: PhoneNumber.restore(row.phone),
        email: row.email ? Email.restore(row.email) : undefined,
        passwordHash: row.passwordHash,
        approval: row.approval ?? undefined,
        permissions: row.permissions,
        coordinationCenterId: row.coordinationCenterId,
        status: row.status,
        blockedReason: row.blockedReason ?? undefined,
        blockedAt: row.blockedAt ?? undefined,
        betaAccess: row.betaAccess,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      UniqueId.from(row.id),
    );
  },

  toPersistence(account: Account): AccountRow {
    return {
      id: account.id.value,
      roles: [...account.roles],
      fullName: account.fullName.value,
      phone: account.phone.value,
      email: account.email?.value ?? null,
      passwordHash: account.passwordHash,
      approval: account.approval ?? null,
      permissions: [...account.permissions],
      coordinationCenterId: account.coordinationCenterId,
      status: account.status,
      blockedReason: account.blockedReason ?? null,
      blockedAt: account.blockedAt ?? null,
      betaAccess: account.betaAccess,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  },
};
