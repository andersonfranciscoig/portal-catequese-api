import { beforeEach, describe, expect, it } from "vitest";

import { UniqueId } from "../../../../shared/domain/unique-id.js";
import {
  AccountWithoutRolesError,
  NotAdministratorError,
  RoleAlreadyAssignedError,
} from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../../testing/identity-test-context.js";

describe("Conta com vários papéis (encarregado e catequista)", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  beforeEach(() => {
    ctx = createIdentityTestContext();
  });

  it("um encarregado acrescenta o papel de catequista, que fica por aprovar", async () => {
    const { account } = await ctx.register.execute(guardianInput);
    const view = await ctx.addOwnRole.execute({ accountId: account.id, role: "CATECHIST" });
    expect(view.roles).toEqual(["GUARDIAN", "CATECHIST"]);
    expect(view.approval).toBe("PENDING");
    expect(ctx.events.published.map((event) => event.name)).toContain(
      "identity.account_role_added",
    );
    expect(ctx.activity.entries.at(-1)?.summary).toBe(
      "Pediu para ser também catequista (por aprovar)",
    );
  });

  it("um catequista acrescenta o papel de encarregado (sem aprovação)", async () => {
    const { account } = await ctx.register.execute({ ...guardianInput, role: "CATECHIST" });
    const view = await ctx.addOwnRole.execute({ accountId: account.id, role: "GUARDIAN" });
    expect(view.roles).toEqual(["CATECHIST", "GUARDIAN"]);
    expect(view.approval).toBe("PENDING");
  });

  it("não repete um papel", async () => {
    const { account } = await ctx.register.execute(guardianInput);
    await expect(
      ctx.addOwnRole.execute({ accountId: account.id, role: "GUARDIAN" }),
    ).rejects.toThrow(RoleAlreadyAssignedError);
  });

  it("um encarregado com pedido de catequista por aprovar mantém as permissões", async () => {
    const admin = await ctx.seedAccount({
      fullName: "Admin Portal",
      phone: "938728358",
      permissions: ["SUPER_ADMIN"],
    });
    const { account } = await ctx.register.execute(guardianInput);
    await ctx.setPermissions.execute({
      actorId: admin.id.value,
      accountId: account.id,
      permissions: ["COORDINATION"],
      coordinationCenterId: "a1000000-0000-4000-8000-000000000001",
    });
    await ctx.addOwnRole.execute({ accountId: account.id, role: "CATECHIST" });
    const stored = await ctx.accounts.findById(UniqueId.from(account.id));
    expect(stored?.hasPermission("COORDINATION")).toBe(true);
  });

  it("só catequista e por aprovar: sem permissões", async () => {
    const catechist = await ctx.seedAccount({
      fullName: "Lucas Pedro",
      phone: "946552310",
      roles: ["CATECHIST"],
      permissions: ["COORDINATION"],
    });
    expect(catechist.effectivePermissions()).toEqual([]);
  });

  it("a administração define os papéis; catequista acrescentado já fica aprovado", async () => {
    const admin = await ctx.seedAccount({
      fullName: "Admin Portal",
      phone: "938728358",
      permissions: ["SUPER_ADMIN"],
    });
    const { account } = await ctx.register.execute(guardianInput);

    const view = await ctx.setRoles.execute({
      actorId: admin.id.value,
      accountId: account.id,
      roles: ["GUARDIAN", "CATECHIST"],
    });
    expect(view).toMatchObject({ roles: ["GUARDIAN", "CATECHIST"], approval: "APPROVED" });
    expect(ctx.activity.entries.at(-1)?.summary).toBe(
      "Alterou os papéis de Anderson Francisco: acrescentou Catequista",
    );

    const withoutCatechist = await ctx.setRoles.execute({
      actorId: admin.id.value,
      accountId: account.id,
      roles: ["GUARDIAN"],
    });
    expect(withoutCatechist.approval).toBeUndefined();
    await expect(
      ctx.setRoles.execute({ actorId: admin.id.value, accountId: account.id, roles: [] }),
    ).rejects.toThrow(AccountWithoutRolesError);
    await expect(
      ctx.setRoles.execute({ actorId: account.id, accountId: account.id, roles: ["CATECHIST"] }),
    ).rejects.toThrow(NotAdministratorError);
  });

  it("aprovar um catequista funciona também em contas com vários papéis", async () => {
    const admin = await ctx.seedAccount({
      fullName: "Admin Portal",
      phone: "938728358",
      permissions: ["SUPER_ADMIN"],
    });
    const { account } = await ctx.register.execute(guardianInput);
    await ctx.addOwnRole.execute({ accountId: account.id, role: "CATECHIST" });
    const view = await ctx.decideCatechist.execute({
      actorId: admin.id.value,
      accountId: account.id,
      decision: "APPROVED",
    });
    expect(view).toMatchObject({ roles: ["GUARDIAN", "CATECHIST"], approval: "APPROVED" });
  });

  it("a pesquisa encontra a conta por qualquer dos papéis", async () => {
    const admin = await ctx.seedAccount({
      fullName: "Admin Portal",
      phone: "938728358",
      permissions: ["SUPER_ADMIN"],
    });
    const { account } = await ctx.register.execute(guardianInput);
    await ctx.addOwnRole.execute({ accountId: account.id, role: "CATECHIST" });
    const catechists = await ctx.listAccounts.execute({
      actorId: admin.id.value,
      role: "CATECHIST",
      page: 1,
      pageSize: 25,
    });
    expect(catechists.items.map((item) => item.fullName)).toEqual(["Anderson Francisco"]);
  });
});
