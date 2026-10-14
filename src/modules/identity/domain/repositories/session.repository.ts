import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Session } from "../session.js";

export abstract class SessionRepository {
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  abstract save(session: Session): Promise<void>;
  abstract revokeAllForAccount(accountId: UniqueId, now: Date): Promise<void>;
}
