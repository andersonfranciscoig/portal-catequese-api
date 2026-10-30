import {
  centerScopeFromAccess,
  type AccessTokenClaims,
  type CenterScope,
} from "../../../identity/index.js";
import { listedCenter } from "../../application/center-scope.js";

/** Âmbito da conta, já relido da base pelo PermissionsGuard. */
export function scopeOf(account: AccessTokenClaims): CenterScope {
  return centerScopeFromAccess({
    permissions: account.permissions,
    coordinationCenterId: account.coordinationCenterId,
  });
}

export { listedCenter };
