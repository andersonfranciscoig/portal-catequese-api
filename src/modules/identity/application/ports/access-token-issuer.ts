import type { AccountRole, Permission } from "../../domain/account-role.js";

export interface AccessTokenClaims {
  accountId: string;
  roles: AccountRole[];
  permissions: Permission[];
  /** Centro da coordenação, quando a conta só vê um centro. */
  coordinationCenterId?: string | null;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export abstract class AccessTokenIssuer {
  abstract issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  abstract verify(token: string): Promise<AccessTokenClaims | null>;
}
