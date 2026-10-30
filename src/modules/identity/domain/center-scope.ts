import { Permission } from "./account-role.js";
import { CoordinationCenterRequiredError } from "./errors/identity.errors.js";

/** Paróquia inteira, ou só o centro da conta de coordenação. */
export type CenterScope = { kind: "parish" } | { kind: "center"; centerId: string };

/**
 * Âmbito lido das permissões efetivas e do centro da conta.
 * Super admin e coordenação geral veem a paróquia. Coordenação de centro só esse centro.
 */
export function centerScopeFromAccess(input: {
  permissions: readonly Permission[];
  coordinationCenterId?: string | null;
}): CenterScope {
  if (
    input.permissions.includes(Permission.SUPER_ADMIN) ||
    input.permissions.includes(Permission.GENERAL_COORDINATION)
  ) {
    return { kind: "parish" };
  }
  if (input.coordinationCenterId) {
    return { kind: "center", centerId: input.coordinationCenterId };
  }
  throw new CoordinationCenterRequiredError();
}
