import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { SessionRepository } from "../../../domain/repositories/session.repository.js";
import type { Session } from "../../../domain/session.js";

export class InMemorySessionRepository extends SessionRepository {
  readonly items = new Map<string, Session>();

  async findByTokenHash(tokenHash: string) {
    return [...this.items.values()].find((item) => item.tokenHash === tokenHash) ?? null;
  }

  async save(session: Session) {
    this.items.set(session.id.value, session);
  }

  async revokeAllForAccount(accountId: UniqueId, now: Date) {
    for (const session of this.items.values()) {
      if (session.accountId.equals(accountId)) session.revoke(now);
    }
  }
}
