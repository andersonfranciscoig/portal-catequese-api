import { describe, expect, it } from "vitest";

import { SEDE_CENTER_ID } from "../../../shared/domain/parish-centers.js";
import { Account } from "./account.js";
import { AccountApproval, Permission, type AccountRole } from "./account-role.js";
import { AccountRegistered } from "./events/account-registered.js";
import { FullName } from "./value-objects/full-name.js";
import { PhoneNumber } from "./value-objects/phone-number.js";

const now = new Date("2026-10-13T10:00:00.000Z");

function register(role: AccountRole, permissions: Permission[] = []) {
  return Account.register({
    roles: [role],
    fullName: FullName.create("Teresa Domingos"),
    phone: PhoneNumber.create("923610204"),
    passwordHash: "hash",
    permissions,
    centerId: SEDE_CENTER_ID,
    now,
  });
}

describe("Account", () => {
  it("regista um evento ao ser criada, ativa e sem acesso de testes", () => {
    const account = register("GUARDIAN");
    expect(account.pullEvents()[0]).toBeInstanceOf(AccountRegistered);
    expect(account.pullEvents()).toHaveLength(0);
    expect(account.isBlocked).toBe(false);
    expect(account.betaAccess).toBe(false);
  });

  it("conta de catequista fica pendente; as outras não têm aprovação", () => {
    expect(register("CATECHIST").approval).toBe(AccountApproval.PENDING);
    expect(register("GUARDIAN").approval).toBeUndefined();
  });

  it("um encarregado pode ter acesso à coordenação", () => {
    const account = register("GUARDIAN");
    account.setPermissions([Permission.COORDINATION], now);
    expect(account.effectivePermissions()).toEqual([Permission.COORDINATION]);
  });

  it("financeiro, fora de prazo e aprovações caem sem a coordenação", () => {
    const account = register("GUARDIAN");
    account.setPermissions([Permission.FINANCE, Permission.APPROVE_CATECHISTS], now);
    expect(account.permissions).toEqual([]);

    account.setPermissions([Permission.COORDINATION, Permission.FINANCE], now);
    expect(account.hasPermission(Permission.FINANCE)).toBe(true);
    expect(account.hasPermission(Permission.LATE_ENROLLMENT)).toBe(false);
  });

  it("o super admin tem todas as permissões", () => {
    const account = register("GUARDIAN", [Permission.SUPER_ADMIN]);
    expect(account.isSuperAdmin).toBe(true);
    expect(account.effectivePermissions()).toEqual(Object.values(Permission));
  });

  it("um catequista só usa permissões depois de aprovado", () => {
    const account = register("CATECHIST", [Permission.COORDINATION]);
    expect(account.effectivePermissions()).toEqual([]);
    account.approve(now);
    expect(account.hasPermission(Permission.COORDINATION)).toBe(true);
    account.reject(now);
    expect(account.hasPermission(Permission.COORDINATION)).toBe(false);
  });

  it("bloqueada, perde todas as permissões (até a administração)", () => {
    const account = register("GUARDIAN", [Permission.SUPER_ADMIN]);
    account.block("Conta partilhada", now);
    expect(account.isBlocked).toBe(true);
    expect(account.isSuperAdmin).toBe(false);
    expect(account.effectivePermissions()).toEqual([]);
    expect(account.blockedReason).toBe("Conta partilhada");

    account.unblock(now);
    expect(account.isSuperAdmin).toBe(true);
    expect(account.blockedReason).toBeUndefined();
  });

  it("aprovar só se aplica a catequistas", () => {
    const account = register("GUARDIAN");
    account.approve(now);
    expect(account.approval).toBeUndefined();
  });
});
