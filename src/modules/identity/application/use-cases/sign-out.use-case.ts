import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import type { SessionRepository } from "../../domain/repositories/session.repository.js";
import type { RefreshTokenGenerator } from "../ports/refresh-token-generator.js";

export interface SignOutInput {
  refreshToken: string;
}

export class SignOutUseCase implements UseCase<SignOutInput, void> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenGenerator,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ refreshToken }: SignOutInput): Promise<void> {
    const session = await this.sessions.findByTokenHash(this.refreshTokens.hash(refreshToken));
    if (!session || session.revokedAt) return;
    session.revoke(this.clock.now());
    await this.sessions.save(session);
    await this.activity.record({
      actorId: session.accountId.value,
      category: "AUTH",
      action: "identity.logout",
      summary: "Terminou a sessão",
    });
  }
}
