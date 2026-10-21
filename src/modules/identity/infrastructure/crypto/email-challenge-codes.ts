import { createHash, randomInt, randomUUID } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

export function hashChallengeCode(code: string, pepper: string): string {
  return createHash("sha256").update(`${code}:${pepper}`).digest("hex");
}

export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function generateResetToken(): string {
  return randomUUID().replace(/-/g, "");
}

export function normalizeChallengeEmail(email: string): string {
  return email.trim().toLowerCase();
}
