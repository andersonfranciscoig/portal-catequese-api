import { beforeEach, describe, expect, it } from "vitest";

import { SANTA_TERESINHA_CENTER_ID } from "../../../../shared/domain/parish-centers.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";
import {
  AccountAlreadyExistsError,
  CenterInactiveError,
  CoordinationCenterNotFoundError,
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
      roles: ["GUARDIAN"],
      fullName: "Anderson Francisco",
      phone: "+244923482117",
      email: "anderson.francisco@gmail.com",
      permissions: [],
      centerId: guardianInput.centerId,
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
      ctx.register.execute({
        ...guardianInput,
        email: "outro.francisco@gmail.com",
        phone: "+244 923-482-117",
      }),
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

  it("grava o centro escolhido", async () => {
    const { account } = await ctx.register.execute({
      ...guardianInput,
      centerId: SANTA_TERESINHA_CENTER_ID,
    });
    expect(account.centerId).toBe(SANTA_TERESINHA_CENTER_ID);
  });

  it("recusa um centro inexistente ou inactivo", async () => {
    await expect(
      ctx.register.execute({ ...guardianInput, centerId: "a1000000-0000-4000-8000-000000000099" }),
    ).rejects.toThrow(CoordinationCenterNotFoundError);
    ctx.centers.inactive.add(guardianInput.centerId);
    await expect(ctx.register.execute(guardianInput)).rejects.toThrow(CenterInactiveError);
  });
});
