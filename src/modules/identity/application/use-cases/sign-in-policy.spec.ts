import { beforeEach, describe, expect, it } from "vitest";

import { UniqueId } from "../../../../shared/domain/unique-id.js";
import {
  AccountBlockedError,
  BetaAccessRequiredError,
  PortalClosedError,
} from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("Regras de entrada (fase de lançamento, encerramento, bloqueio)", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  beforeEach(() => {
    ctx = createIdentityTestContext();
  });

  it("na fase de testes, só cria conta quem tem o pedido de acesso aceite", async () => {
    ctx.launch.mode = "BETA";
    await expect(ctx.register.execute(guardianInput)).rejects.toThrow(BetaAccessRequiredError);

    ctx.launch.approvedContacts.add("+244923482117");
    const { account } = await ctx.register.execute(guardianInput);
    expect(account.betaAccess).toBe(true);
  });

  it("na fase de testes, uma conta sem acesso não entra; a administração entra sempre", async () => {
    await ctx.seedAccount({ fullName: "Ana Silva", phone: "931000001" });
    await ctx.seedAccount({
      fullName: "Admin Portal",
      phone: "938728358",
      permissions: ["SUPER_ADMIN"],
    });
    ctx.launch.mode = "BETA";

    await expect(
      ctx.authenticate.execute({ identifier: "931000001", password: "catequese1" }),
    ).rejects.toThrow(BetaAccessRequiredError);
    await expect(
      ctx.authenticate.execute({ identifier: "938728358", password: "catequese1" }),
    ).resolves.toBeTruthy();
    expect(ctx.activity.actions()).toContain("identity.login_denied");
  });

  it("com o portal encerrado, só a administração entra e ninguém cria conta", async () => {
    await ctx.seedAccount({ fullName: "Ana Silva", phone: "931000001" });
    await ctx.seedAccount({
      fullName: "Admin Portal",
      phone: "938728358",
      permissions: ["SUPER_ADMIN"],
    });
    ctx.launch.portalOpen = false;
    ctx.launch.closedMessage = "Manutenção até amanhã.";

    await expect(
      ctx.authenticate.execute({ identifier: "931000001", password: "catequese1" }),
    ).rejects.toThrow("Manutenção até amanhã.");
    await expect(
      ctx.authenticate.execute({ identifier: "938728358", password: "catequese1" }),
    ).resolves.toBeTruthy();
    await expect(
      ctx.register.execute({
        ...guardianInput,
        phone: "925555111",
        email: "ana.silva@exemplo.ao",
      }),
    ).rejects.toThrow(PortalClosedError);
  });

  it("uma conta bloqueada não entra nem renova a sessão", async () => {
    const { refreshToken, account } = await ctx.register.execute(guardianInput);
    const stored = await ctx.accounts.findById(UniqueId.from(account.id));
    stored!.block("Uso indevido", ctx.clock.now());

    await expect(
      ctx.authenticate.execute({ identifier: "923482117", password: "catequese1" }),
    ).rejects.toThrow(AccountBlockedError);
    await expect(ctx.refresh.execute({ refreshToken })).rejects.toThrow(AccountBlockedError);
  });
});
