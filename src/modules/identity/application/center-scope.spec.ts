import { beforeEach, describe, expect, it } from "vitest";

import { SEDE_CENTER_ID } from "../../../shared/domain/parish-centers.js";
import { grantGeneralCoordination, Permission } from "../domain/account-role.js";
import { centerScopeFromAccess } from "../domain/center-scope.js";
import {
  CoordinationCenterNotFoundError,
  CoordinationCenterRequiredError,
} from "../domain/errors/identity.errors.js";
import { createIdentityTestContext, guardianInput } from "../testing/identity-test-context.js";

describe("Âmbito da coordenação", () => {
  it("uma conta COORDINATION antiga, tratada como geral, vê a paróquia", () => {
    const permissions = grantGeneralCoordination([Permission.COORDINATION]);
    expect(permissions).toContain(Permission.GENERAL_COORDINATION);
    expect(centerScopeFromAccess({ permissions, coordinationCenterId: null })).toEqual({
      kind: "parish",
    });
  });

  it("super admin vê a paróquia mesmo sem a flag", () => {
    expect(
      centerScopeFromAccess({
        permissions: [Permission.SUPER_ADMIN],
        coordinationCenterId: null,
      }),
    ).toEqual({ kind: "parish" });
  });

  it("coordenação com centro fica nesse centro; sem centro é recusada", () => {
    expect(
      centerScopeFromAccess({
        permissions: [Permission.COORDINATION],
        coordinationCenterId: SEDE_CENTER_ID,
      }),
    ).toEqual({ kind: "center", centerId: SEDE_CENTER_ID });
    expect(() =>
      centerScopeFromAccess({
        permissions: [Permission.COORDINATION],
        coordinationCenterId: null,
      }),
    ).toThrow(CoordinationCenterRequiredError);
  });
});

describe("Permissões com centro de coordenação", () => {
  let ctx: ReturnType<typeof createIdentityTestContext>;
  let adminId: string;

  beforeEach(async () => {
    ctx = createIdentityTestContext();
    adminId = (
      await ctx.seedAccount({
        fullName: "Anderson Francisco",
        phone: "938728358",
        permissions: ["SUPER_ADMIN"],
      })
    ).id.value;
  });

  it("coordenação de centro exige um centro que exista; a geral limpa o centro", async () => {
    const { account } = await ctx.register.execute(guardianInput);
    await expect(
      ctx.setPermissions.execute({
        actorId: adminId,
        accountId: account.id,
        permissions: ["COORDINATION"],
      }),
    ).rejects.toBeInstanceOf(CoordinationCenterRequiredError);
    await expect(
      ctx.setPermissions.execute({
        actorId: adminId,
        accountId: account.id,
        permissions: ["COORDINATION"],
        coordinationCenterId: "a1000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toBeInstanceOf(CoordinationCenterNotFoundError);

    const granted = await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: account.id,
      permissions: ["COORDINATION"],
      coordinationCenterId: SEDE_CENTER_ID,
    });
    expect(granted.coordinationCenterId).toBe(SEDE_CENTER_ID);
    expect(granted.permissions).toEqual(["COORDINATION"]);

    const general = await ctx.setPermissions.execute({
      actorId: adminId,
      accountId: account.id,
      permissions: ["COORDINATION", "GENERAL_COORDINATION"],
    });
    expect(general.coordinationCenterId).toBeNull();
  });
});
