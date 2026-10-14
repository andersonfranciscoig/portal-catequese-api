import {
  LaunchAccessPolicy,
  type LaunchSnapshot,
} from "../../../shared/application/launch-access-policy.js";
import {
  AccessTokenIssuer,
  type AccessTokenClaims,
  type IssuedAccessToken,
} from "../application/ports/access-token-issuer.js";
import { RefreshTokenGenerator } from "../application/ports/refresh-token-generator.js";
import { PasswordHasher } from "../domain/services/password-hasher.js";
import type { Password } from "../domain/value-objects/password.js";

export class FakePasswordHasher extends PasswordHasher {
  async hash(password: Password) {
    return `hashed:${password.value}`;
  }

  async matches(plain: string, hash: string | undefined) {
    return hash === `hashed:${plain}`;
  }
}

export class FakeAccessTokenIssuer extends AccessTokenIssuer {
  readonly issued: AccessTokenClaims[] = [];

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    this.issued.push(claims);
    return {
      token: `access:${claims.accountId}:${this.issued.length}`,
      expiresAt: new Date("2026-10-13T10:15:00.000Z"),
    };
  }

  async verify(token: string) {
    const [, accountId] = token.split(":");
    return this.issued.find((claims) => claims.accountId === accountId) ?? null;
  }
}

export class SequentialRefreshTokenGenerator extends RefreshTokenGenerator {
  private count = 0;

  generate() {
    this.count += 1;
    return `refresh-${this.count}`;
  }

  hash(token: string) {
    return `sha:${token}`;
  }
}

/** Fase de lançamento controlada nos testes (por omissão: aberto a todos). */
export class FakeLaunchPolicy extends LaunchAccessPolicy {
  mode: "BETA" | "PUBLIC" = "PUBLIC";
  portalOpen = true;
  closedMessage?: string;
  readonly approvedContacts = new Set<string>();

  async snapshot(): Promise<LaunchSnapshot> {
    return { mode: this.mode, portalOpen: this.portalOpen, closedMessage: this.closedMessage };
  }

  async isApprovedForBeta(phone: string, email?: string) {
    return this.approvedContacts.has(phone) || Boolean(email && this.approvedContacts.has(email));
  }
}
