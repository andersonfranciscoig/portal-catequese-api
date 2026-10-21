import { beforeEach, describe, expect, it } from "vitest";

import {
  AccountAlreadyExistsError,
  EmailChallengeInvalidError,
  EmailChallengeRateLimitedError,
  EmailRequiredError,
  InvalidCredentialsError,
} from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("Registo com OTP e recuperação de conta", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  beforeEach(() => {
    ctx = createIdentityTestContext();
  });

  it("envia o código, cria a conta só depois da confirmação e dá as boas-vindas", async () => {
    const pending = await ctx.requestRegistration.execute(guardianInput);
    expect(pending).toMatchObject({
      email: "anderson.francisco@gmail.com",
      expiresInSec: 600,
    });
    expect(ctx.accounts.items.size).toBe(0);
    const otp = ctx.mailer.lastOtp()?.otp;
    expect(otp).toMatch(/^\d{6}$/);

    const result = await ctx.confirmRegistration.execute({
      email: pending.email,
      code: otp!,
    });
    expect(result.account).toMatchObject({
      fullName: "Anderson Francisco",
      email: "anderson.francisco@gmail.com",
    });
    expect(ctx.mailer.welcomes).toHaveLength(1);
    expect(ctx.sessions.items.size).toBe(1);
  });

  it("recusa código errado e não cria a conta", async () => {
    await ctx.requestRegistration.execute(guardianInput);
    await expect(
      ctx.confirmRegistration.execute({
        email: guardianInput.email,
        code: "000000",
      }),
    ).rejects.toThrow(EmailChallengeInvalidError);
    expect(ctx.accounts.items.size).toBe(0);
  });

  it("não deixa pedir outro código no mesmo minuto", async () => {
    await ctx.requestRegistration.execute(guardianInput);
    await expect(ctx.requestRegistration.execute(guardianInput)).rejects.toThrow(
      EmailChallengeRateLimitedError,
    );
  });

  it("o email é obrigatório no registo", async () => {
    await expect(
      ctx.requestRegistration.execute({ ...guardianInput, email: "" }),
    ).rejects.toThrow(EmailRequiredError);
  });

  it("recusa telefone já registado antes de enviar o código", async () => {
    await ctx.register.execute(guardianInput);
    await expect(
      ctx.requestRegistration.execute({
        ...guardianInput,
        email: "novo@exemplo.ao",
      }),
    ).rejects.toThrow(AccountAlreadyExistsError);
  });

  it("envia o link de recuperação e redefine a palavra-passe", async () => {
    await ctx.register.execute(guardianInput);
    await ctx.requestPasswordReset.execute({ email: guardianInput.email });
    const token = ctx.mailer.lastReset()?.token;
    expect(token).toBeTruthy();

    await ctx.resetPassword.execute({
      email: guardianInput.email,
      token: token!,
      password: "nova12345",
    });
    expect(ctx.mailer.passwordChanged).toHaveLength(1);
    await expect(
      ctx.authenticate.execute({ identifier: guardianInput.email, password: "catequese1" }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      ctx.authenticate.execute({ identifier: guardianInput.email, password: "nova12345" }),
    ).resolves.toBeTruthy();
  });

  it("não revela se o email tem conta", async () => {
    await expect(
      ctx.requestPasswordReset.execute({ email: "ninguem@exemplo.ao" }),
    ).resolves.toBeUndefined();
    expect(ctx.mailer.passwordResets).toHaveLength(0);
  });
});
