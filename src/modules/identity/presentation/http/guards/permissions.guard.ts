import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { DomainError } from "../../../../../shared/domain/domain-error.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Permission } from "../../../domain/account-role.js";
import {
  AccountBlockedError,
  InvalidSessionError,
} from "../../../domain/errors/identity.errors.js";
import { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { REQUIRED_PERMISSIONS } from "../decorators/require-permissions.decorator.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";

export class MissingPermissionError extends DomainError {
  readonly kind = "forbidden";
  readonly code = "identity.missing_permission";
  constructor() {
    super("A sua conta não tem permissão para esta área.");
  }
}

/**
 * Usar depois do `AuthGuard`: exige as permissões de `@RequirePermissions`,
 * confirmadas na base de dados (uma permissão retirada ou uma conta bloqueada
 * deixam logo de valer, sem esperar que o token expire).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accounts: AccountRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.account) throw new InvalidSessionError();
    const account = await this.accounts.findById(UniqueId.from(request.account.accountId));
    if (!account) throw new InvalidSessionError();
    if (account.isBlocked) throw new AccountBlockedError(account.blockedReason);
    if (!required.every((permission) => account.hasPermission(permission))) {
      throw new MissingPermissionError();
    }
    request.account = {
      ...request.account,
      permissions: account.effectivePermissions(),
      coordinationCenterId: account.coordinationCenterId,
    };
    return true;
  }
}
