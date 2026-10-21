import type { AccountRole } from "../../domain/account-role.js";

export type RegisterChallengePayload = {
  role: AccountRole;
  fullName: string;
  phone: string;
  email: string;
  passwordHash: string;
  betaAccess: boolean;
};

export type PasswordResetPayload = {
  accountId: string;
  firstName: string;
};

export type IssuedChallenge = {
  code: string;
  expiresInSec: number;
};

/**
 * Códigos e tokens enviados por email (OTP no registo, link de recuperação).
 * A aplicação não sabe se estão na base de dados ou em memória.
 */
export abstract class EmailChallenges {
  abstract issueRegister(
    email: string,
    payload: RegisterChallengePayload,
  ): Promise<IssuedChallenge>;

  abstract consumeRegister(email: string, code: string): Promise<RegisterChallengePayload>;

  abstract issuePasswordReset(
    email: string,
    payload: PasswordResetPayload,
  ): Promise<IssuedChallenge>;

  abstract consumePasswordReset(email: string, token: string): Promise<PasswordResetPayload>;
}
