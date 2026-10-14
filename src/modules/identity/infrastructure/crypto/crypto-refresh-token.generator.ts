import { createHash, randomBytes } from "node:crypto";

import { RefreshTokenGenerator } from "../../application/ports/refresh-token-generator.js";

export class CryptoRefreshTokenGenerator extends RefreshTokenGenerator {
  generate(): string {
    return randomBytes(48).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
