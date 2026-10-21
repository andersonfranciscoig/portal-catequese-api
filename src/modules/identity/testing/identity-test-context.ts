import { RecordingMailer } from "../../../shared/testing/recording-mailer.js";
import { RecordingNotifier } from "../../../shared/testing/recording-notifier.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import { RecordingActivity } from "../../../shared/testing/recording-activity.js";
import { RecordingEventBus } from "../../../shared/testing/recording-event-bus.js";
import { Account } from "../domain/account.js";
import type { AccountRole, Permission } from "../domain/account-role.js";
import { FullName } from "../domain/value-objects/full-name.js";
import { PhoneNumber } from "../domain/value-objects/phone-number.js";
import { Email } from "../domain/value-objects/email.js";
import { AccountDirectoryService } from "../application/account-directory.service.js";
import { SessionIssuer } from "../application/session-issuer.js";
import { SignInPolicy } from "../application/sign-in-policy.js";
import { BlockAccountUseCase } from "../application/use-cases/admin/block-account.use-case.js";
import { DecideCatechistUseCase } from "../application/use-cases/admin/decide-catechist.use-case.js";
import { GetAccountStatsUseCase } from "../application/use-cases/admin/get-account-stats.use-case.js";
import { GetAccountUseCase } from "../application/use-cases/admin/get-account.use-case.js";
import { GrantBetaAccessByContactUseCase } from "../application/use-cases/admin/grant-beta-access-by-contact.use-case.js";
import { ListAccountsUseCase } from "../application/use-cases/admin/list-accounts.use-case.js";
import { ListCatechistApplicationsUseCase } from "../application/use-cases/admin/list-catechist-applications.use-case.js";
import { SetAccountPermissionsUseCase } from "../application/use-cases/admin/set-account-permissions.use-case.js";
import { SetBetaAccessUseCase } from "../application/use-cases/admin/set-beta-access.use-case.js";
import { SetAccountRolesUseCase } from "../application/use-cases/admin/set-account-roles.use-case.js";
import { UnblockAccountUseCase } from "../application/use-cases/admin/unblock-account.use-case.js";
import { AddOwnRoleUseCase } from "../application/use-cases/add-own-role.use-case.js";
import { AuthenticateUseCase } from "../application/use-cases/authenticate.use-case.js";
import { ChangePasswordUseCase } from "../application/use-cases/change-password.use-case.js";
import { ConfirmRegistrationUseCase } from "../application/use-cases/confirm-registration.use-case.js";
import { GetCurrentAccountUseCase } from "../application/use-cases/get-current-account.use-case.js";
import { RefreshSessionUseCase } from "../application/use-cases/refresh-session.use-case.js";
import { RegisterAccountUseCase } from "../application/use-cases/register-account.use-case.js";
import { RequestPasswordResetUseCase } from "../application/use-cases/request-password-reset.use-case.js";
import { RequestRegistrationUseCase } from "../application/use-cases/request-registration.use-case.js";
import { ResetPasswordUseCase } from "../application/use-cases/reset-password.use-case.js";
import { SignOutUseCase } from "../application/use-cases/sign-out.use-case.js";
import { UpdateProfileUseCase } from "../application/use-cases/update-profile.use-case.js";
import { InMemoryAccountRepository } from "../infrastructure/persistence/in-memory/in-memory-account.repository.js";
import { InMemoryEmailChallenges } from "../infrastructure/persistence/in-memory/in-memory-email-challenges.js";
import { InMemorySessionRepository } from "../infrastructure/persistence/in-memory/in-memory-session.repository.js";
import {
  FakeAccessTokenIssuer,
  FakeLaunchPolicy,
  FakePasswordHasher,
  SequentialRefreshTokenGenerator,
} from "./fakes.js";

/** Monta os casos de uso de identidade com dependências em memória. */
export function createIdentityTestContext() {
  const accounts = new InMemoryAccountRepository();
  const notifier = new RecordingNotifier();
  const mailer = new RecordingMailer();
  const sessions = new InMemorySessionRepository();
  const hasher = new FakePasswordHasher();
  const accessTokens = new FakeAccessTokenIssuer();
  const refreshTokens = new SequentialRefreshTokenGenerator();
  const events = new RecordingEventBus();
  const activity = new RecordingActivity();
  const launch = new FakeLaunchPolicy();
  const clock = new FixedClock();
  const issuer = new SessionIssuer(sessions, accessTokens, refreshTokens, clock, {
    refreshTokenTtlDays: 30,
  });
  const policy = new SignInPolicy(launch);
  const challenges = new InMemoryEmailChallenges(clock);
  const register = new RegisterAccountUseCase(
    accounts,
    hasher,
    issuer,
    policy,
    events,
    activity,
    clock,
    notifier,
    mailer,
  );

  /** Cria diretamente uma conta (ex.: a administração inicial). */
  async function seedAccount(options: {
    fullName: string;
    phone: string;
    email?: string;
    roles?: AccountRole[];
    permissions?: Permission[];
    betaAccess?: boolean;
    password?: string;
  }) {
    const account = Account.register({
      roles: options.roles ?? ["GUARDIAN"],
      fullName: FullName.create(options.fullName),
      phone: PhoneNumber.create(options.phone),
      email: options.email ? Email.create(options.email) : undefined,
      passwordHash: `hashed:${options.password ?? "catequese1"}`,
      permissions: options.permissions,
      betaAccess: options.betaAccess,
      now: clock.now(),
    });
    account.pullEvents();
    await accounts.save(account);
    return account;
  }

  return {
    accounts,
    notifier,
    mailer,
    challenges,
    sessions,
    accessTokens,
    events,
    activity,
    launch,
    clock,
    seedAccount,
    register,
    requestRegistration: new RequestRegistrationUseCase(
      accounts,
      hasher,
      policy,
      challenges,
      mailer,
    ),
    confirmRegistration: new ConfirmRegistrationUseCase(challenges, register),
    requestPasswordReset: new RequestPasswordResetUseCase(accounts, challenges, mailer),
    resetPassword: new ResetPasswordUseCase(accounts, hasher, challenges, activity, clock, mailer),
    authenticate: new AuthenticateUseCase(accounts, hasher, issuer, policy, activity),
    refresh: new RefreshSessionUseCase(sessions, accounts, refreshTokens, issuer, policy, clock),
    signOut: new SignOutUseCase(sessions, refreshTokens, activity, clock),
    currentAccount: new GetCurrentAccountUseCase(accounts),
    updateProfile: new UpdateProfileUseCase(accounts, activity, clock),
    changePassword: new ChangePasswordUseCase(accounts, hasher, activity, clock, mailer),
    addOwnRole: new AddOwnRoleUseCase(accounts, events, activity, clock, notifier),
    setRoles: new SetAccountRolesUseCase(accounts, events, activity, clock, notifier),
    listAccounts: new ListAccountsUseCase(accounts),
    getAccount: new GetAccountUseCase(accounts),
    stats: new GetAccountStatsUseCase(accounts),
    setPermissions: new SetAccountPermissionsUseCase(accounts, activity, clock, notifier),
    block: new BlockAccountUseCase(accounts, sessions, activity, clock),
    unblock: new UnblockAccountUseCase(accounts, activity, clock, notifier),
    catechistApplications: new ListCatechistApplicationsUseCase(accounts),
    decideCatechist: new DecideCatechistUseCase(accounts, activity, clock, notifier),
    setBetaAccess: new SetBetaAccessUseCase(accounts, activity, clock),
    grantBetaByContact: new GrantBetaAccessByContactUseCase(accounts, clock),
    directory: new AccountDirectoryService(accounts),
  };
}

export const guardianInput = {
  role: "GUARDIAN" as const,
  fullName: "Anderson Francisco",
  phone: "923 482 117",
  email: "Anderson.Francisco@Gmail.com",
  password: "catequese1",
};
