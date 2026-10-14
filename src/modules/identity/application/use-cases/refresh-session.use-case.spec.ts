import { beforeEach, describe, expect, it } from "vitest";

import { InvalidSessionError } from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

const DAY = 86_400_000;

describe("RefreshSessionUseCase", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  let refreshToken: string;
  beforeEach(async () => {
    ctx = createIdentityTestContext();
    ({ refreshToken } = await ctx.register.execute(guardianInput));
  });

  it("emite novos tokens e invalida o refresh token usado (rotação)", async () => {
    const renewed = await ctx.refresh.execute({ refreshToken });
    expect(renewed.refreshToken).not.toBe(refreshToken);
    expect(renewed.account.fullName).toBe("Anderson Francisco");

    // O novo continua a funcionar.
    await expect(ctx.refresh.execute({ refreshToken: renewed.refreshToken })).resolves.toBeTruthy();
  });

  it("reutilizar um token já rodado termina todas as sessões da conta", async () => {
    const renewed = await ctx.refresh.execute({ refreshToken });

    await expect(ctx.refresh.execute({ refreshToken })).rejects.toThrow(InvalidSessionError);
    // Até o token novo (possivelmente do atacante) deixa de valer.
    await expect(ctx.refresh.execute({ refreshToken: renewed.refreshToken })).rejects.toThrow(
      InvalidSessionError,
    );
  });

  it("recusa token desconhecido", async () => {
    await expect(ctx.refresh.execute({ refreshToken: "inventado" })).rejects.toThrow(
      InvalidSessionError,
    );
  });

  it("recusa sessão expirada", async () => {
    ctx.clock.advance(31 * DAY);
    await expect(ctx.refresh.execute({ refreshToken })).rejects.toThrow(InvalidSessionError);
  });

  it("recusa sessão terminada", async () => {
    await ctx.signOut.execute({ refreshToken });
    await expect(ctx.refresh.execute({ refreshToken })).rejects.toThrow(InvalidSessionError);
  });
});
