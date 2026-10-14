import type { AccountRole, Permission } from "../../domain/account-role.js";

export interface AccessTokenClaims {
  accountId: string;
  role: AccountRole;
  permissions: Permission[];
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export abstract class AccessTokenIssuer {
  abstract issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  abstract verify(token: string): Promise<AccessTokenClaims | null>;
}
