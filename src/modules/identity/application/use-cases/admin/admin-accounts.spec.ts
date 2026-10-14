import { beforeEach, describe, expect, it } from "vitest";

import {
  AccountBlockedError,
  InvalidSessionError,
  NotACatechistError,
  NotAdministratorError,
  SelfAdministrationError,
} from "../../../domain/errors/identity.errors.js";
import {
  createIdentityTestContext,
  guardianInput,
} from "../../../testing/identity-test-context.js";

describe("Administração das contas", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  let adminId: string;
  let userId: string;
  let userRefresh: string;

  beforeEach(async () => {
    ctx = createIdentityTestContext();
    adminId = (
      await ctx.seedAccount({
        fullName: "Anderson Francisco",
        phone: "938728358",
        permissions: ["SUPER_ADMIN"],
      })
    ).id.value;
    const user = await ctx.register.execute({
      ...guardianInput,
      fullName: "Teresa Domingos",
      phone: "923610204",
      email: undefined,
    });
    userId = user.account.id;
    userRefresh = user.refreshToken;
  });

  it("só a administração consulta e altera contas", async () => {
    await expect(
      ctx.listAccounts.execute({ actorId: userId, page: 1, pageSize: 25 }),
    ).rejects.toThrow(NotAdministratorError);
    const page = await ctx.listAccounts.execute({ actorId: adminId, page: 1, pageSize: 25 });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.fullName)).toEqual([
      "Anderson Francisco",
      "Teresa Domingos",
    ]);
  });

  it("pesquisa e filtra as contas", async () => {
    const byName = await ctx.listAccounts.execute({
      actorId: adminId,
      search: "teresa",
      page: 1,
      pageSize: 25,
    });
    expect(byName.items).toHaveLength(1);
    const admins = await ctx.listAccounts.execute({
      actorId: adminId,
      access: "admin",
      page: 1,
      pageSize: 25,
    });
    expect(admins.items.map((item) => item.id)).toEqual([adminId]);
  });

  it("dá permissões detalhadas e regista o que mudou", async () => {
    const view = await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: userId,
      permissions: ["COORDINATION", "FINANCE"],
    });
    expect(view.permissions).toEqual(["COORDINATION", "FINANCE"]);
    expect(ctx.activity.entries.at(-1)).toMatchObject({
      action: "identity.permissions_changed",
      targetAccountId: userId,
      summary: "Alterou as permissões de Teresa Domingos: deu Área da coordenação, Menu financeiro",
    });
  });

  it("não deixa a administração retirar-se a si própria nem ficar sem administração", async () => {
    await expect(
      ctx.setPermissions.execute({ actorId: adminId, accountId: adminId, permissions: [] }),
    ).rejects.toThrow(SelfAdministrationError);
    await expect(
      ctx.block.execute({ actorId: adminId, accountId: adminId, reason: "teste" }),
    ).rejects.toThrow(SelfAdministrationError);

    // Uma segunda administração não pode bloquear a única outra.
    await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: userId,
      permissions: ["SUPER_ADMIN"],
    });
    await ctx.block.execute({ actorId: userId, accountId: adminId, reason: "Saiu da paróquia" });
    await expect(
      ctx.setPermissions.execute({ actorId: userId, accountId: userId, permissions: [] }),
    ).rejects.toThrow(SelfAdministrationError);
  });

  it("bloquear termina as sessões e impede de entrar; desbloquear devolve o acesso", async () => {
    await ctx.block.execute({ actorId: adminId, accountId: userId, reason: "Uso indevido" });
    await expect(ctx.refresh.execute({ refreshToken: userRefresh })).rejects.toThrow(
      InvalidSessionError,
    );
    await expect(
      ctx.authenticate.execute({ identifier: "923610204", password: "catequese1" }),
    ).rejects.toThrow(AccountBlockedError);

    await ctx.unblock.execute({ actorId: adminId, accountId: userId });
    await expect(
      ctx.authenticate.execute({ identifier: "923610204", password: "catequese1" }),
    ).resolves.toBeTruthy();
  });

  it("aprova catequistas (e só catequistas)", async () => {
    await expect(
      ctx.decideCatechist.execute({ actorId: adminId, accountId: userId, decision: "APPROVED" }),
    ).rejects.toThrow(NotACatechistError);
    const catechist = await ctx.register.execute({
      ...guardianInput,
      role: "CATECHIST",
      fullName: "Lucas Pedro",
      phone: "946552310",
      email: undefined,
    });
    const view = await ctx.decideCatechist.execute({
      actorId: adminId,
      accountId: catechist.account.id,
      decision: "APPROVED",
    });
    expect(view.approval).toBe("APPROVED");
  });

  it("dá acesso de testes a uma conta e às contas com o contacto de um pedido aceite", async () => {
    const view = await ctx.setBetaAccess.execute({
      actorId: adminId,
      accountId: userId,
      betaAccess: true,
    });
    expect(view.betaAccess).toBe(true);

    const other = await ctx.seedAccount({
      fullName: "Rosa Afonso",
      phone: "923555111",
      email: "rosa@gmail.com",
    });
    expect(
      await ctx.grantBetaByContact.execute({ phone: "+244923555111", email: "rosa@gmail.com" }),
    ).toBe(1);
    expect((await ctx.accounts.findById(other.id))?.betaAccess).toBe(true);
  });

  it("conta as contas para a visão geral e mostra os nomes no diretório", async () => {
    const stats = await ctx.stats.execute({ actorId: adminId });
    expect(stats).toMatchObject({ total: 2, admins: 1, blocked: 0 });
    expect(await ctx.directory.namesFor([adminId, userId])).toEqual({
      [adminId]: "Anderson Francisco",
      [userId]: "Teresa Domingos",
    });
  });
});
