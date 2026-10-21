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
import { Mailer } from "../../shared/application/mailer.js";
import { Notifier } from "../../shared/application/notifier.js";
import { PeopleDirectory } from "../../shared/application/people-directory.js";
import { Clock } from "../../shared/domain/clock.js";
import { PrismaService } from "../../shared/infrastructure/database/prisma.service.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { AccountDirectoryService } from "./application/account-directory.service.js";
import { IdentityPeopleDirectory } from "./application/identity-people-directory.js";
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
import { ListCatechistApplicationsUseCase } from "./application/use-cases/admin/list-catechist-applications.use-case.js";
import { SetAccountPermissionsUseCase } from "./application/use-cases/admin/set-account-permissions.use-case.js";
import { SetBetaAccessUseCase } from "./application/use-cases/admin/set-beta-access.use-case.js";
import { SetAccountRolesUseCase } from "./application/use-cases/admin/set-account-roles.use-case.js";
import { UnblockAccountUseCase } from "./application/use-cases/admin/unblock-account.use-case.js";
import { AddOwnRoleUseCase } from "./application/use-cases/add-own-role.use-case.js";
import { AuthenticateUseCase } from "./application/use-cases/authenticate.use-case.js";
import { ChangePasswordUseCase } from "./application/use-cases/change-password.use-case.js";
import { ConfirmRegistrationUseCase } from "./application/use-cases/confirm-registration.use-case.js";
import { GetCurrentAccountUseCase } from "./application/use-cases/get-current-account.use-case.js";
import { RefreshSessionUseCase } from "./application/use-cases/refresh-session.use-case.js";
import { RegisterAccountUseCase } from "./application/use-cases/register-account.use-case.js";
import { RequestPasswordResetUseCase } from "./application/use-cases/request-password-reset.use-case.js";
import { RequestRegistrationUseCase } from "./application/use-cases/request-registration.use-case.js";
import { ResetPasswordUseCase } from "./application/use-cases/reset-password.use-case.js";
import { SignOutUseCase } from "./application/use-cases/sign-out.use-case.js";
import { UpdateProfileUseCase } from "./application/use-cases/update-profile.use-case.js";
import { EmailChallenges } from "./application/ports/email-challenges.js";
import { AccountRepository } from "./domain/repositories/account.repository.js";
import { SessionRepository } from "./domain/repositories/session.repository.js";
import { PasswordHasher } from "./domain/services/password-hasher.js";
import { BcryptPasswordHasher } from "./infrastructure/crypto/bcrypt-password-hasher.js";
import { CryptoRefreshTokenGenerator } from "./infrastructure/crypto/crypto-refresh-token.generator.js";
import { JwtAccessTokenIssuer } from "./infrastructure/crypto/jwt-access-token.issuer.js";
import { PrismaAccountRepository } from "./infrastructure/persistence/prisma/prisma-account.repository.js";
import { PrismaEmailChallenges } from "./infrastructure/persistence/prisma/prisma-email-challenges.js";
import { PrismaSessionRepository } from "./infrastructure/persistence/prisma/prisma-session.repository.js";
import { AdminAccountsController } from "./presentation/http/admin-accounts.controller.js";
import { CoordinationCatechistsController } from "./presentation/http/coordination-catechists.controller.js";
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
  controllers: [AuthController, AdminAccountsController, CoordinationCatechistsController],
  providers: [
    { provide: AccountRepository, useClass: PrismaAccountRepository },
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    {
      provide: EmailChallenges,
      inject: [PrismaService, Clock, AppConfig],
      useFactory: (prisma: PrismaService, clock: Clock, config: AppConfig) =>
        new PrismaEmailChallenges(prisma, clock, config),
    },
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
    {
      provide: PeopleDirectory,
      inject: [AccountRepository],
      useFactory: (accounts: AccountRepository) => new IdentityPeopleDirectory(accounts),
    },
    // Conta própria
    provideUseCase(RegisterAccountUseCase, [
      AccountRepository,
      PasswordHasher,
      SessionIssuer,
      SignInPolicy,
      EventBus,
      AUDIT,
      Clock,
      Notifier,
      Mailer,
    ]),
    provideUseCase(RequestRegistrationUseCase, [
      AccountRepository,
      PasswordHasher,
      SignInPolicy,
      EmailChallenges,
      Mailer,
    ]),
    provideUseCase(ConfirmRegistrationUseCase, [EmailChallenges, RegisterAccountUseCase]),
    provideUseCase(RequestPasswordResetUseCase, [AccountRepository, EmailChallenges, Mailer]),
    provideUseCase(ResetPasswordUseCase, [
      AccountRepository,
      PasswordHasher,
      EmailChallenges,
      AUDIT,
      Clock,
      Mailer,
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
    provideUseCase(ChangePasswordUseCase, [AccountRepository, PasswordHasher, AUDIT, Clock, Mailer]),
    provideUseCase(AddOwnRoleUseCase, [AccountRepository, EventBus, AUDIT, Clock, Notifier]),
    // Administração
    provideUseCase(ListAccountsUseCase, [AccountRepository]),
    provideUseCase(ListCatechistApplicationsUseCase, [AccountRepository]),
    provideUseCase(GetAccountUseCase, [AccountRepository]),
    provideUseCase(GetAccountStatsUseCase, [AccountRepository]),
    provideUseCase(SetAccountPermissionsUseCase, [AccountRepository, AUDIT, Clock, Notifier]),
    provideUseCase(BlockAccountUseCase, [AccountRepository, SessionRepository, AUDIT, Clock]),
    provideUseCase(UnblockAccountUseCase, [AccountRepository, AUDIT, Clock, Notifier]),
    provideUseCase(DecideCatechistUseCase, [AccountRepository, AUDIT, Clock, Notifier]),
    provideUseCase(SetBetaAccessUseCase, [AccountRepository, AUDIT, Clock]),
    provideUseCase(SetAccountRolesUseCase, [AccountRepository, EventBus, AUDIT, Clock, Notifier]),
    provideUseCase(GrantBetaAccessByContactUseCase, [AccountRepository, Clock]),
    AuthGuard,
    PermissionsGuard,
  ],
  // Os outros módulos protegem rotas com os guards (que precisam do verificador
  // de tokens e das contas) e consultam nomes e papéis pelos diretórios.
  exports: [
    AuthGuard,
    PermissionsGuard,
    AccessTokenIssuer,
    AccountRepository,
    AccountDirectoryService,
    PeopleDirectory,
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
