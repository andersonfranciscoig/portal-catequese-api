import { beforeEach, describe, expect, it } from "vitest";

import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";
import {
  AccountAlreadyExistsError,
  InvalidPhoneNumberError,
  WeakPasswordError,
} from "../../domain/errors/identity.errors.js";

describe("RegisterAccountUseCase", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  beforeEach(() => {
    ctx = createIdentityTestContext();
  });

  it("cria a conta, guarda só o hash e abre a sessão", async () => {
    const result = await ctx.register.execute(guardianInput);

    expect(result.account).toMatchObject({
      role: "GUARDIAN",
      fullName: "Anderson Francisco",
      phone: "+244923482117",
      email: "anderson.francisco@gmail.com",
      permissions: [],
    });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBe("refresh-1");

    const stored = [...ctx.accounts.items.values()][0];
    expect(stored.passwordHash).not.toBe(guardianInput.password);
    expect(ctx.sessions.items.size).toBe(1);
  });

  it("publica o evento de conta registada", async () => {
    await ctx.register.execute(guardianInput);
    expect(ctx.events.published.map((event) => event.name)).toEqual([
      "identity.account_registered",
    ]);
  });

  it("catequista fica pendente e sem permissões efetivas", async () => {
    const { account } = await ctx.register.execute({
      ...guardianInput,
      role: "CATECHIST",
    });
    expect(account.approval).toBe("PENDING");
    expect(account.permissions).toEqual([]);
  });

  it("recusa telefone já registado, mesmo escrito de outra forma", async () => {
    await ctx.register.execute(guardianInput);
    await expect(
      ctx.register.execute({ ...guardianInput, email: undefined, phone: "+244 923-482-117" }),
    ).rejects.toThrow(AccountAlreadyExistsError);
  });

  it("recusa email já registado", async () => {
    await ctx.register.execute(guardianInput);
    await expect(
      ctx.register.execute({
        ...guardianInput,
        phone: "931205448",
        email: "ANDERSON.FRANCISCO@gmail.com",
      }),
    ).rejects.toThrow(AccountAlreadyExistsError);
  });

  it("valida os dados antes de gravar", async () => {
    await expect(ctx.register.execute({ ...guardianInput, phone: "123" })).rejects.toThrow(
      InvalidPhoneNumberError,
    );
    await expect(ctx.register.execute({ ...guardianInput, password: "fraca" })).rejects.toThrow(
      WeakPasswordError,
    );
    expect(ctx.accounts.items.size).toBe(0);
  });
});
