import { beforeEach, describe, expect, it } from "vitest";

import { InvalidCredentialsError } from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("AuthenticateUseCase", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  beforeEach(async () => {
    ctx = createIdentityTestContext();
    await ctx.register.execute(guardianInput);
  });

  it.each([
    "923482117",
    "+244 923 482 117",
    "anderson.francisco@gmail.com",
    " ANDERSON.FRANCISCO@GMAIL.COM ",
  ])("entra com %s", async (identifier) => {
    const result = await ctx.authenticate.execute({ identifier, password: "catequese1" });
    expect(result.account.fullName).toBe("Anderson Francisco");
    expect(result.refreshToken).toBeTruthy();
  });

  it.each([
    ["palavra-passe errada", "923482117", "errada123"],
    ["conta inexistente", "931205448", "catequese1"],
    ["telefone mal escrito", "123", "catequese1"],
    ["email mal escrito", "ana@", "catequese1"],
  ])("recusa %s com a mesma mensagem", async (_, identifier, password) => {
    await expect(ctx.authenticate.execute({ identifier, password })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("o token de acesso leva só as permissões efetivas", async () => {
    await ctx.authenticate.execute({ identifier: "923482117", password: "catequese1" });
    expect(ctx.accessTokens.issued.at(-1)).toMatchObject({ role: "GUARDIAN", permissions: [] });
  });
});
