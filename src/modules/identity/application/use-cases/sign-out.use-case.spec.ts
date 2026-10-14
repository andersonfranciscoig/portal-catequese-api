import { describe, expect, it } from "vitest";

import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("SignOutUseCase", () => {
  it("termina a sessão e é idempotente", async () => {
    const ctx = createIdentityTestContext();
    const { refreshToken } = await ctx.register.execute(guardianInput);

    await ctx.signOut.execute({ refreshToken });
    await expect(ctx.signOut.execute({ refreshToken })).resolves.toBeUndefined();
    await expect(ctx.signOut.execute({ refreshToken: "desconhecido" })).resolves.toBeUndefined();

    const [session] = ctx.sessions.items.values();
    expect(session.revokedAt).toBeDefined();
  });
});
