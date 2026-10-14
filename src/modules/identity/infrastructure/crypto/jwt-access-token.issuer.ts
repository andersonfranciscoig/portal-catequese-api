import type { JwtService } from "@nestjs/jwt";

import {
  AccessTokenIssuer,
  type AccessTokenClaims,
  type IssuedAccessToken,
} from "../../application/ports/access-token-issuer.js";
import { AccountRole, Permission } from "../../domain/account-role.js";

interface JwtPayload {
  sub: string;
  roles: string[];
  permissions: string[];
}

const ROLES = new Set<string>(Object.values(AccountRole));
const PERMISSIONS = new Set<string>(Object.values(Permission));

/** Tokens de acesso JWT (HS256), de curta duração. */
export class JwtAccessTokenIssuer extends AccessTokenIssuer {
  constructor(
    private readonly jwt: JwtService,
    private readonly ttlSeconds: number,
  ) {
    super();
  }

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const payload: JwtPayload = {
      sub: claims.accountId,
      roles: claims.roles,
      permissions: claims.permissions,
    };
    const token = await this.jwt.signAsync(payload, { expiresIn: this.ttlSeconds });
    return { token, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000) };
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (!Array.isArray(payload.roles) || !payload.roles.every((role) => ROLES.has(role))) {
        return null;
      }
      return {
        accountId: payload.sub,
        roles: payload.roles as AccountRole[],
        permissions: payload.permissions.filter((item): item is Permission =>
          PERMISSIONS.has(item),
        ),
      };
    } catch {
      return null;
    }
  }
}
