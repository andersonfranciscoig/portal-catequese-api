import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { InvalidSessionError } from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import type { SessionRepository } from "../../domain/repositories/session.repository.js";
import type { RefreshTokenGenerator } from "../ports/refresh-token-generator.js";
import type { AuthResult, SessionIssuer } from "../session-issuer.js";
import type { SignInPolicy } from "../sign-in-policy.js";

export interface RefreshSessionInput {
  refreshToken: string;
  userAgent?: string;
}

export class RefreshSessionUseCase implements UseCase<RefreshSessionInput, AuthResult> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accounts: AccountRepository,
    private readonly refreshTokens: RefreshTokenGenerator,
    private readonly issuer: SessionIssuer,
    private readonly policy: SignInPolicy,
    private readonly clock: Clock,
  ) {}

  async execute({ refreshToken, userAgent }: RefreshSessionInput): Promise<AuthResult> {
    const now = this.clock.now();
    const session = await this.sessions.findByTokenHash(this.refreshTokens.hash(refreshToken));
    if (!session) throw new InvalidSessionError();

    if (session.wasRotated) {
      await this.sessions.revokeAllForAccount(session.accountId, now);
      throw new InvalidSessionError();
    }
    if (!session.isActive(now)) throw new InvalidSessionError();

    const account = await this.accounts.findById(session.accountId);
    if (!account) throw new InvalidSessionError();
    // Bloqueada, portal encerrado ou sem acesso de testes: a sessão termina aqui.
    try {
      await this.policy.assertCanSignIn(account);
    } catch (error) {
      session.revoke(now);
      await this.sessions.save(session);
      throw error;
    }

    const { result, session: next } = await this.issuer.open(
      account,
      userAgent ?? session.userAgent,
    );
    session.revoke(now, next.id);
    await this.sessions.save(session);
    return result;
  }
}
