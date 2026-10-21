import type { AppConfig } from "../../../../../config/app-config.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import {
  EmailChallengeExpiredError,
  EmailChallengeInvalidError,
  EmailChallengeRateLimitedError,
  EmailChallengeTooManyAttemptsError,
} from "../../../domain/errors/identity.errors.js";
import {
  EmailChallenges,
  type PasswordResetPayload,
  type RegisterChallengePayload,
} from "../../../application/ports/email-challenges.js";
import {
  generateOtp,
  generateResetToken,
  hashChallengeCode,
  MAX_ATTEMPTS,
  normalizeChallengeEmail,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  RESET_TTL_MS,
} from "../../crypto/email-challenge-codes.js";

export class PrismaEmailChallenges extends EmailChallenges {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    config: AppConfig,
  ) {
    super();
    this.pepper = config.email.otpSecret || config.jwtAccessSecret;
  }

  async issueRegister(email: string, payload: RegisterChallengePayload) {
    return this.issue(email, "REGISTER", payload, generateOtp(), OTP_TTL_MS);
  }

  async consumeRegister(email: string, code: string) {
    return (await this.consume({
      email,
      purpose: "REGISTER",
      code,
      wrongMessage: "Código incorrecto.",
    })) as RegisterChallengePayload;
  }

  async issuePasswordReset(email: string, payload: PasswordResetPayload) {
    return this.issue(email, "PASSWORD_RESET", payload, generateResetToken(), RESET_TTL_MS);
  }

  async consumePasswordReset(email: string, token: string) {
    return (await this.consume({
      email,
      purpose: "PASSWORD_RESET",
      code: token,
      wrongMessage: "Link inválido ou expirado.",
      missingMessage: "Link inválido ou expirado.",
      expiredMessage: "Link inválido ou expirado.",
    })) as PasswordResetPayload;
  }

  private async issue(
    email: string,
    purpose: "REGISTER" | "PASSWORD_RESET",
    payload: RegisterChallengePayload | PasswordResetPayload,
    code: string,
    ttlMs: number,
  ) {
    const normalized = normalizeChallengeEmail(email);
    await this.assertCooldown(normalized, purpose);
    const now = this.clock.now();
    await this.prisma.emailChallenge.deleteMany({ where: { email: normalized, purpose } });
    await this.prisma.emailChallenge.create({
      data: {
        id: UniqueId.create().value,
        email: normalized,
        purpose,
        codeHash: hashChallengeCode(code, this.pepper),
        payloadJson: payload,
        expiresAt: new Date(now.getTime() + ttlMs),
        createdAt: now,
      },
    });
    return { code, expiresInSec: ttlMs / 1000 };
  }

  private async consume({
    email,
    purpose,
    code,
    wrongMessage,
    missingMessage,
    expiredMessage,
  }: {
    email: string;
    purpose: "REGISTER" | "PASSWORD_RESET";
    code: string;
    wrongMessage: string;
    missingMessage?: string;
    expiredMessage?: string;
  }) {
    const normalized = normalizeChallengeEmail(email);
    const challenge = await this.prisma.emailChallenge.findFirst({
      where: { email: normalized, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) {
      throw new EmailChallengeInvalidError(missingMessage ?? "Código inválido ou expirado.");
    }
    if (challenge.expiresAt.getTime() < this.clock.now().getTime()) {
      throw new EmailChallengeExpiredError(expiredMessage);
    }
    if (challenge.attempts >= MAX_ATTEMPTS) throw new EmailChallengeTooManyAttemptsError();
    if (challenge.codeHash !== hashChallengeCode(code.trim(), this.pepper)) {
      await this.prisma.emailChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new EmailChallengeInvalidError(wrongMessage);
    }
    await this.prisma.emailChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: this.clock.now() },
    });
    return challenge.payloadJson;
  }

  private async assertCooldown(email: string, purpose: "REGISTER" | "PASSWORD_RESET") {
    const recent = await this.prisma.emailChallenge.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: "desc" },
    });
    if (
      recent &&
      this.clock.now().getTime() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new EmailChallengeRateLimitedError();
    }
  }
}
