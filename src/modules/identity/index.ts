/**
 * API pública do módulo de identidade. Outros módulos importam SÓ daqui
 * (a regra de lint `no-restricted-imports` impede o resto). Se o módulo virar
 * um serviço à parte, este contrato passa a ser chamado por rede.
 */
export { IdentityModule } from "./identity.module.js";
export { AccountRole, AccountApproval, Permission } from "./domain/account-role.js";
export { centerScopeFromAccess, type CenterScope } from "./domain/center-scope.js";
export type { AccessTokenClaims } from "./application/ports/access-token-issuer.js";
export { AccountDirectoryService } from "./application/account-directory.service.js";
export { AuthGuard } from "./presentation/http/guards/auth.guard.js";
export { PermissionsGuard } from "./presentation/http/guards/permissions.guard.js";
export { RequirePermissions } from "./presentation/http/decorators/require-permissions.decorator.js";
export { CurrentAccount } from "./presentation/http/decorators/current-account.decorator.js";
export { AccountRepository } from "./domain/repositories/account.repository.js";
