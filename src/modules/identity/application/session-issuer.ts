import type { Clock } from "../../../shared/domain/clock.js";
import type { Account } from "../domain/account.js";
import type { SessionRepository } from "../domain/repositories/session.repository.js";
import { Session } from "../domain/session.js";
import type { AccessTokenIssuer } from "./ports/access-token-issuer.js";
import type { RefreshTokenGenerator } from "./ports/refresh-token-generator.js";
import { toAccountView, type AccountView } from "./account-view.js";

export interface AuthResult {
  account: AccountView;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface SessionSettings {
  refreshTokenTtlDays: number;
}

export class SessionIssuer {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly refreshTokens: RefreshTokenGenerator,
    private readonly clock: Clock,
    private readonly settings: SessionSettings,
  ) {}

  async open(
    account: Account,
    userAgent?: string,
  ): Promise<{ result: AuthResult; session: Session }> {
    const now = this.clock.now();
    const refreshToken = this.refreshTokens.generate();
    const session = Session.start({
      accountId: account.id,
      tokenHash: this.refreshTokens.hash(refreshToken),
      now,
      ttlDays: this.settings.refreshTokenTtlDays,
      userAgent,
    });
    await this.sessions.save(session);
    const access = await this.accessTokens.issue({
      accountId: account.id.value,
      role: account.role,
      permissions: account.effectivePermissions(),
    });
    return {
      session,
      result: {
        account: toAccountView(account),
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        refreshToken,
        refreshTokenExpiresAt: session.expiresAt.toISOString(),
      },
    };
  }
}
