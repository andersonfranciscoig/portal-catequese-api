import { beforeEach, describe, expect, it } from "vitest";

import {
  AccountAlreadyExistsError,
  IncorrectPasswordError,
  InvalidCredentialsError,
  SamePasswordError,
  WeakPasswordError,
} from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("Perfil e palavra-passe", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  let accountId: string;
  beforeEach(async () => {
    ctx = createIdentityTestContext();
    ({
      account: { id: accountId },
    } = await ctx.register.execute(guardianInput));
  });

  it("atualiza o nome, o telefone e o email e regista o que mudou", async () => {
    const view = await ctx.updateProfile.execute({
      accountId,
      fullName: "Anderson Francisco Kiala",
      phone: "923 482 117",
      email: "anderson@novo.ao",
    });
    expect(view).toMatchObject({ fullName: "Anderson Francisco Kiala", email: "anderson@novo.ao" });
    expect(ctx.activity.entries.at(-1)?.summary).toBe("Atualizou o perfil (nome, email)");
  });

  it("não deixa usar o telefone de outra conta", async () => {
    await ctx.seedAccount({ fullName: "Outra Pessoa", phone: "931000001" });
    await expect(
      ctx.updateProfile.execute({
        accountId,
        fullName: "Anderson Francisco",
        phone: "931000001",
        email: guardianInput.email,
      }),
    ).rejects.toThrow(AccountAlreadyExistsError);
  });

  it("muda a palavra-passe só com a atual correta", async () => {
    await expect(
      ctx.changePassword.execute({
        accountId,
        currentPassword: "errada123",
        newPassword: "nova12345",
      }),
    ).rejects.toThrow(IncorrectPasswordError);
    await expect(
      ctx.changePassword.execute({
        accountId,
        currentPassword: "catequese1",
        newPassword: "catequese1",
      }),
    ).rejects.toThrow(SamePasswordError);
    await expect(
      ctx.changePassword.execute({
        accountId,
        currentPassword: "catequese1",
        newPassword: "fraca",
      }),
    ).rejects.toThrow(WeakPasswordError);

    await ctx.changePassword.execute({
      accountId,
      currentPassword: "catequese1",
      newPassword: "nova12345",
    });
    await expect(
      ctx.authenticate.execute({ identifier: "923482117", password: "catequese1" }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      ctx.authenticate.execute({ identifier: "923482117", password: "nova12345" }),
    ).resolves.toBeTruthy();
  });
});
