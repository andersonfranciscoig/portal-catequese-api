import { Entity } from "../../../shared/domain/entity.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";

interface SessionProps {
  accountId: UniqueId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
  replacedById?: UniqueId;
  userAgent?: string;
}

export interface StartSessionProps {
  accountId: UniqueId;
  tokenHash: string;
  now: Date;
  ttlDays: number;
  userAgent?: string;
}

const DAY_MS = 86_400_000;

export class Session extends Entity<SessionProps> {
  static start({ accountId, tokenHash, now, ttlDays, userAgent }: StartSessionProps): Session {
    return new Session({
      accountId,
      tokenHash,
      userAgent,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
    });
  }

  static restore(props: SessionProps, id: UniqueId): Session {
    return new Session({ ...props }, id);
  }

  get accountId() {
    return this.props.accountId;
  }
  get tokenHash() {
    return this.props.tokenHash;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get revokedAt() {
    return this.props.revokedAt;
  }
  get replacedById() {
    return this.props.replacedById;
  }
  get userAgent() {
    return this.props.userAgent;
  }

  isActive(now: Date): boolean {
    return !this.props.revokedAt && now < this.props.expiresAt;
  }

  get wasRotated(): boolean {
    return Boolean(this.props.replacedById);
  }

  revoke(now: Date, replacedBy?: UniqueId): void {
    if (this.props.revokedAt) return;
    this.props.revokedAt = now;
    this.props.replacedById = replacedBy;
  }
}
