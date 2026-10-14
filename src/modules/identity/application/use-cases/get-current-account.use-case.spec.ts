import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AccountNotFoundError } from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("GetCurrentAccountUseCase", () => {
  it("devolve a conta sem dados sensíveis", async () => {
    const ctx = createIdentityTestContext();
    const { account } = await ctx.register.execute(guardianInput);

    const view = await ctx.currentAccount.execute({ accountId: account.id });
    expect(view).toEqual(account);
    expect(JSON.stringify(view)).not.toContain("hashed:");
  });

  it("falha se a conta não existir", async () => {
    const ctx = createIdentityTestContext();
    await expect(ctx.currentAccount.execute({ accountId: randomUUID() })).rejects.toThrow(
      AccountNotFoundError,
    );
  });
});
