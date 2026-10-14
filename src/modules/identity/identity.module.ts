import { Module, type OnModuleInit } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";

import { AppConfig } from "../../config/app-config.js";
import { ActivityRecorder } from "../../shared/application/activity-recorder.js";
import { EventBus } from "../../shared/application/event-bus.js";
import {
  ACCESS_REQUEST_APPROVED,
  type AccessRequestApprovedEvent,
} from "../../shared/application/integration-events.js";
import { LaunchAccessPolicy } from "../../shared/application/launch-access-policy.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { AccountDirectoryService } from "./application/account-directory.service.js";
import { AccessTokenIssuer } from "./application/ports/access-token-issuer.js";
import { RefreshTokenGenerator } from "./application/ports/refresh-token-generator.js";
import { SessionIssuer } from "./application/session-issuer.js";
import { SignInPolicy } from "./application/sign-in-policy.js";
import { BlockAccountUseCase } from "./application/use-cases/admin/block-account.use-case.js";
import { DecideCatechistUseCase } from "./application/use-cases/admin/decide-catechist.use-case.js";
import { GetAccountStatsUseCase } from "./application/use-cases/admin/get-account-stats.use-case.js";
import { GetAccountUseCase } from "./application/use-cases/admin/get-account.use-case.js";
import { GrantBetaAccessByContactUseCase } from "./application/use-cases/admin/grant-beta-access-by-contact.use-case.js";
import { ListAccountsUseCase } from "./application/use-cases/admin/list-accounts.use-case.js";
import { SetAccountPermissionsUseCase } from "./application/use-cases/admin/set-account-permissions.use-case.js";
import { SetBetaAccessUseCase } from "./application/use-cases/admin/set-beta-access.use-case.js";
import { SetAccountRolesUseCase } from "./application/use-cases/admin/set-account-roles.use-case.js";
import { UnblockAccountUseCase } from "./application/use-cases/admin/unblock-account.use-case.js";
import { AddOwnRoleUseCase } from "./application/use-cases/add-own-role.use-case.js";
import { AuthenticateUseCase } from "./application/use-cases/authenticate.use-case.js";
import { ChangePasswordUseCase } from "./application/use-cases/change-password.use-case.js";
import { GetCurrentAccountUseCase } from "./application/use-cases/get-current-account.use-case.js";
import { RefreshSessionUseCase } from "./application/use-cases/refresh-session.use-case.js";
import { RegisterAccountUseCase } from "./application/use-cases/register-account.use-case.js";
import { SignOutUseCase } from "./application/use-cases/sign-out.use-case.js";
import { UpdateProfileUseCase } from "./application/use-cases/update-profile.use-case.js";
import { AccountRepository } from "./domain/repositories/account.repository.js";
import { SessionRepository } from "./domain/repositories/session.repository.js";
import { PasswordHasher } from "./domain/services/password-hasher.js";
import { BcryptPasswordHasher } from "./infrastructure/crypto/bcrypt-password-hasher.js";
import { CryptoRefreshTokenGenerator } from "./infrastructure/crypto/crypto-refresh-token.generator.js";
import { JwtAccessTokenIssuer } from "./infrastructure/crypto/jwt-access-token.issuer.js";
import { PrismaAccountRepository } from "./infrastructure/persistence/prisma/prisma-account.repository.js";
import { PrismaSessionRepository } from "./infrastructure/persistence/prisma/prisma-session.repository.js";
import { AdminAccountsController } from "./presentation/http/admin-accounts.controller.js";
import { AuthController } from "./presentation/http/auth.controller.js";
import { AuthGuard } from "./presentation/http/guards/auth.guard.js";
import { PermissionsGuard } from "./presentation/http/guards/permissions.guard.js";

const AUDIT = ActivityRecorder;

/**
 * Módulo de identidade: contas, sessões, permissões e administração das contas.
 * O domínio e a aplicação não dependem do Nest: aqui só se ligam as peças.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtAccessSecret,
        signOptions: { algorithm: "HS256" },
        verifyOptions: { algorithms: ["HS256"] },
      }),
    }),
  ],
  controllers: [AuthController, AdminAccountsController],
  providers: [
    { provide: AccountRepository, useClass: PrismaAccountRepository },
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    { provide: PasswordHasher, useFactory: () => new BcryptPasswordHasher() },
    { provide: RefreshTokenGenerator, useClass: CryptoRefreshTokenGenerator },
    {
      provide: AccessTokenIssuer,
      inject: [JwtService, AppConfig],
      useFactory: (jwt: JwtService, config: AppConfig) =>
        new JwtAccessTokenIssuer(jwt, config.jwtAccessTtlSeconds),
    },
    {
      provide: SessionIssuer,
      inject: [SessionRepository, AccessTokenIssuer, RefreshTokenGenerator, Clock, AppConfig],
      useFactory: (
        sessions: SessionRepository,
        accessTokens: AccessTokenIssuer,
        refreshTokens: RefreshTokenGenerator,
        clock: Clock,
        config: AppConfig,
      ) =>
        new SessionIssuer(sessions, accessTokens, refreshTokens, clock, {
          refreshTokenTtlDays: config.refreshTokenTtlDays,
        }),
    },
    provideUseCase(SignInPolicy, [LaunchAccessPolicy]),
    provideUseCase(AccountDirectoryService, [AccountRepository]),
    // Conta própria
    provideUseCase(RegisterAccountUseCase, [
      AccountRepository,
      PasswordHasher,
      SessionIssuer,
      SignInPolicy,
      EventBus,
      AUDIT,
      Clock,
    ]),
    provideUseCase(AuthenticateUseCase, [
      AccountRepository,
      PasswordHasher,
      SessionIssuer,
      SignInPolicy,
      AUDIT,
    ]),
    provideUseCase(RefreshSessionUseCase, [
      SessionRepository,
      AccountRepository,
      RefreshTokenGenerator,
      SessionIssuer,
      SignInPolicy,
      Clock,
    ]),
    provideUseCase(SignOutUseCase, [SessionRepository, RefreshTokenGenerator, AUDIT, Clock]),
    provideUseCase(GetCurrentAccountUseCase, [AccountRepository]),
    provideUseCase(UpdateProfileUseCase, [AccountRepository, AUDIT, Clock]),
    provideUseCase(ChangePasswordUseCase, [AccountRepository, PasswordHasher, AUDIT, Clock]),
    provideUseCase(AddOwnRoleUseCase, [AccountRepository, EventBus, AUDIT, Clock]),
    // Administração
    provideUseCase(ListAccountsUseCase, [AccountRepository]),
    provideUseCase(GetAccountUseCase, [AccountRepository]),
    provideUseCase(GetAccountStatsUseCase, [AccountRepository]),
    provideUseCase(SetAccountPermissionsUseCase, [AccountRepository, AUDIT, Clock]),
    provideUseCase(BlockAccountUseCase, [AccountRepository, SessionRepository, AUDIT, Clock]),
    provideUseCase(UnblockAccountUseCase, [AccountRepository, AUDIT, Clock]),
    provideUseCase(DecideCatechistUseCase, [AccountRepository, AUDIT, Clock]),
    provideUseCase(SetBetaAccessUseCase, [AccountRepository, AUDIT, Clock]),
    provideUseCase(SetAccountRolesUseCase, [AccountRepository, EventBus, AUDIT, Clock]),
    provideUseCase(GrantBetaAccessByContactUseCase, [AccountRepository, Clock]),
    AuthGuard,
    PermissionsGuard,
  ],
  // Os outros módulos protegem rotas com os guards (que precisam do verificador
  // de tokens e das contas) e consultam nomes pelo diretório.
  exports: [
    AuthGuard,
    PermissionsGuard,
    AccessTokenIssuer,
    AccountRepository,
    AccountDirectoryService,
  ],
})
export class IdentityModule implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly grantBetaAccess: GrantBetaAccessByContactUseCase,
  ) {}

  /** Pedido de acesso aceite (módulo `platform`): as contas com esse contacto entram. */
  onModuleInit() {
    this.events.subscribe<AccessRequestApprovedEvent>(ACCESS_REQUEST_APPROVED, (event) =>
      this.grantBetaAccess
        .execute({ phone: event.phone, email: event.email })
        .then(() => undefined),
    );
  }
}
