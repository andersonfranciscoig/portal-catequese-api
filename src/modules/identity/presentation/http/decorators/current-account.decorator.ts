import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AccessTokenClaims } from "../../../application/ports/access-token-issuer.js";
import type { AuthenticatedRequest } from "../guards/authenticated-request.js";

export const CurrentAccount = createParamDecorator(
  (_: unknown, context: ExecutionContext): AccessTokenClaims =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().account,
);
