import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Session as SessionRow } from "../../../../../shared/infrastructure/database/generated/client.js";
import { Session } from "../../../domain/session.js";

export const SessionMapper = {
  toDomain(row: SessionRow): Session {
    return Session.restore(
      {
        accountId: UniqueId.from(row.accountId),
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt ?? undefined,
        replacedById: row.replacedById ? UniqueId.from(row.replacedById) : undefined,
        userAgent: row.userAgent ?? undefined,
      },
      UniqueId.from(row.id),
    );
  },

  toPersistence(session: Session): SessionRow {
    return {
      id: session.id.value,
      accountId: session.accountId.value,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      revokedAt: session.revokedAt ?? null,
      replacedById: session.replacedById?.value ?? null,
      userAgent: session.userAgent ?? null,
    };
  },
};
