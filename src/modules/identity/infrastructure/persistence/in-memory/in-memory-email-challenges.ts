import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
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

type Purpose = "REGISTER" | "PASSWORD_RESET";

interface StoredChallenge {
  id: string;
  email: string;
  purpose: Purpose;
  codeHash: string;
  payload: RegisterChallengePayload | PasswordResetPayload;
  attempts: number;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

const PEPPER = "test-otp-secret";

/** Desafios de email em memória (testes). */
export class InMemoryEmailChallenges extends EmailChallenges {
  readonly items: StoredChallenge[] = [];

  constructor(private readonly clock: Clock) {
    super();
  }

  async issueRegister(email: string, payload: RegisterChallengePayload) {
    return this.issue(email, "REGISTER", payload, generateOtp(), OTP_TTL_MS);
  }

  async consumeRegister(email: string, code: string) {
    return (await this.consume(
      email,
      "REGISTER",
      code,
      "Código incorrecto.",
    )) as RegisterChallengePayload;
  }

  async issuePasswordReset(email: string, payload: PasswordResetPayload) {
    return this.issue(email, "PASSWORD_RESET", payload, generateResetToken(), RESET_TTL_MS);
  }

  async consumePasswordReset(email: string, token: string) {
    return (await this.consume(
      email,
      "PASSWORD_RESET",
      token,
      "Link inválido ou expirado.",
      "Link inválido ou expirado.",
    )) as PasswordResetPayload;
  }

  private async issue(
    email: string,
    purpose: Purpose,
    payload: RegisterChallengePayload | PasswordResetPayload,
    code: string,
    ttlMs: number,
  ) {
    const normalized = normalizeChallengeEmail(email);
    this.assertCooldown(normalized, purpose);
    const now = this.clock.now();
    this.items.splice(
      0,
      this.items.length,
      ...this.items.filter((item) => !(item.email === normalized && item.purpose === purpose)),
    );
    this.items.push({
      id: UniqueId.create().value,
      email: normalized,
      purpose,
      codeHash: hashChallengeCode(code, PEPPER),
      payload,
      attempts: 0,
      expiresAt: new Date(now.getTime() + ttlMs),
      createdAt: now,
    });
    return { code, expiresInSec: ttlMs / 1000 };
  }

  private consume(
    email: string,
    purpose: Purpose,
    code: string,
    wrongMessage: string,
    missingMessage?: string,
  ) {
    const normalized = normalizeChallengeEmail(email);
    const now = this.clock.now();
    const challenge = this.items
      .filter((item) => item.email === normalized && item.purpose === purpose && !item.consumedAt)
      .at(-1);
    if (!challenge) {
      throw new EmailChallengeInvalidError(missingMessage ?? "Código inválido ou expirado.");
    }
    if (challenge.expiresAt.getTime() < now.getTime()) {
      throw new EmailChallengeExpiredError(
        purpose === "PASSWORD_RESET" ? "Link inválido ou expirado." : undefined,
      );
    }
    if (challenge.attempts >= MAX_ATTEMPTS) throw new EmailChallengeTooManyAttemptsError();
    if (challenge.codeHash !== hashChallengeCode(code.trim(), PEPPER)) {
      challenge.attempts += 1;
      throw new EmailChallengeInvalidError(wrongMessage);
    }
    challenge.consumedAt = now;
    return Promise.resolve(challenge.payload);
  }

  private assertCooldown(email: string, purpose: Purpose) {
    const recent = this.items
      .filter((item) => item.email === email && item.purpose === purpose)
      .at(-1);
    if (recent && this.clock.now().getTime() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new EmailChallengeRateLimitedError();
    }
  }
}
