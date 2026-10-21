import { beforeEach, describe, expect, it } from "vitest";

import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("Notificações das contas", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  let adminId: string;
  beforeEach(async () => {
    ctx = createIdentityTestContext();
    adminId = (
      await ctx.seedAccount({
        fullName: "Admin Portal",
        phone: "938728358",
        permissions: ["SUPER_ADMIN"],
      })
    ).id.value;
  });

  it("uma conta nova avisa a administração; a de catequista avisa quem aprova", async () => {
    await ctx.register.execute(guardianInput);
    expect(ctx.notifier.last("identity.account_registered")).toMatchObject({
      to: { permission: "SUPER_ADMIN" },
      body: "Anderson Francisco criou uma conta.",
    });
    await ctx.register.execute({
      ...guardianInput,
      phone: "923000111",
      email: "lucas.pedro@exemplo.ao",
      role: "CATECHIST",
    });
    expect(ctx.notifier.last("identity.catechist_requested")).toMatchObject({
      to: { permission: "APPROVE_CATECHISTS" },
      link: "/dashboard/catequistas",
    });
  });

  it("pedir para ser também catequista avisa quem aprova; a decisão avisa a pessoa", async () => {
    const { account } = await ctx.register.execute(guardianInput);
    await ctx.addOwnRole.execute({ accountId: account.id, role: "CATECHIST" });
    expect(ctx.notifier.last("identity.catechist_requested")).toMatchObject({
      body: "Anderson Francisco pediu para ser também catequista.",
      exceptAccountId: account.id,
    });

    await ctx.decideCatechist.execute({
      actorId: adminId,
      accountId: account.id,
      decision: "REJECTED",
    });
    expect(ctx.notifier.last("identity.catechist_rejected")).toMatchObject({
      to: { accountIds: [account.id] },
      title: "O seu pedido para ser catequista não foi aprovado",
    });
    await ctx.decideCatechist.execute({
      actorId: adminId,
      accountId: account.id,
      decision: "APPROVED",
    });
    expect(ctx.notifier.last("identity.catechist_approved")).toMatchObject({
      to: { accountIds: [account.id] },
      link: "/portal",
      body: "Já pode usar o portal de catequista: troque de portal no menu da conta.",
    });
  });

  it("papéis, acessos e desbloqueio dados pela administração avisam a pessoa", async () => {
    const { account } = await ctx.register.execute(guardianInput);
    await ctx.setRoles.execute({
      actorId: adminId,
      accountId: account.id,
      roles: ["GUARDIAN", "CATECHIST"],
    });
    expect(ctx.notifier.last("identity.catechist_approved")?.title).toBe("Passou a ser catequista");

    await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: account.id,
      permissions: ["COORDINATION", "FINANCE"],
    });
    expect(ctx.notifier.last("identity.coordination_granted")).toMatchObject({
      link: "/dashboard",
    });
    await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: account.id,
      permissions: ["COORDINATION"],
    });
    expect(ctx.notifier.last("identity.permissions_changed")?.body).toBe(
      "Retirado: Menu financeiro.",
    );

    const before = ctx.notifier.messages.length;
    await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: account.id,
      permissions: ["COORDINATION"],
    });
    expect(ctx.notifier.messages).toHaveLength(before);

    await ctx.block.execute({ actorId: adminId, accountId: account.id, reason: "Teste" });
    await ctx.unblock.execute({ actorId: adminId, accountId: account.id });
    expect(ctx.notifier.last("identity.account_unblocked")?.to).toEqual({
      accountIds: [account.id],
    });
  });
});
