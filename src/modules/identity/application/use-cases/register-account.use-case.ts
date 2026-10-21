import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { EventBus } from "../../../../shared/application/event-bus.js";
import type { Mailer } from "../../../../shared/application/mailer.js";
import type { Notifier } from "../../../../shared/application/notifier.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { Account } from "../../domain/account.js";
import type { AccountRole } from "../../domain/account-role.js";
import {
  AccountAlreadyExistsError,
  EmailRequiredError,
} from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import { Email } from "../../domain/value-objects/email.js";
import { FullName } from "../../domain/value-objects/full-name.js";
import { Password } from "../../domain/value-objects/password.js";
import { PhoneNumber } from "../../domain/value-objects/phone-number.js";
import { ROLE_LABEL } from "../role-label.js";
import type { AuthResult, SessionIssuer } from "../session-issuer.js";
import type { SignInPolicy } from "../sign-in-policy.js";

export interface RegisterAccountInput {
  role: AccountRole;
  fullName: string;
  phone: string;
  email: string;
  password?: string;
  /** Já calculado (confirmação do OTP). */
  passwordHash?: string;
  userAgent?: string;
}

/**
 * Cria a conta e abre a sessão. No HTTP isto só corre depois do código de
 * email; nos testes também se chama directamente.
 */
export class RegisterAccountUseCase implements UseCase<RegisterAccountInput, AuthResult> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly policy: SignInPolicy,
    private readonly events: EventBus,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    private readonly mailer: Mailer,
  ) {}

  async execute(input: RegisterAccountInput): Promise<AuthResult> {
    const fullName = FullName.create(input.fullName);
    const phone = PhoneNumber.create(input.phone);
    if (!input.email?.trim()) throw new EmailRequiredError();
    const email = Email.create(input.email);
    const passwordHash =
      input.passwordHash ?? (await this.hasher.hash(Password.create(input.password ?? "")));

    const [byPhone, byEmail] = await Promise.all([
      this.accounts.findByPhone(phone),
      this.accounts.findByEmail(email),
    ]);
    if (byPhone || byEmail) throw new AccountAlreadyExistsError();
    const { betaAccess } = await this.policy.assertCanRegister(phone.value, email.value);

    const account = Account.register({
      roles: [input.role],
      fullName,
      phone,
      email,
      passwordHash,
      betaAccess,
      now: this.clock.now(),
    });
    await this.accounts.save(account);
    await this.events.publish(account.pullEvents());
    await this.activity.record({
      actorId: account.id.value,
      category: "AUTH",
      action: "identity.account_registered",
      summary: account.hasRole("CATECHIST")
        ? "Criou uma conta de catequista (por aprovar)"
        : "Criou uma conta no portal",
    });

    await this.notifier.notify(
      account.hasRole("CATECHIST")
        ? {
            to: { permission: "APPROVE_CATECHISTS" },
            kind: "identity.catechist_requested",
            title: "Novo pedido de catequista",
            body: `${account.fullName.value} criou uma conta de catequista e aguarda aprovação.`,
            link: "/dashboard/catequistas",
          }
        : {
            to: { permission: "SUPER_ADMIN" },
            kind: "identity.account_registered",
            title: "Nova conta no portal",
            body: `${account.fullName.value} criou uma conta.`,
            link: `/admin/utilizadores/${account.id.value}`,
          },
    );

    this.mailer.sendWelcome({
      email: email.value,
      firstName: fullName.firstName,
      roleLabel: ROLE_LABEL[input.role],
    });

    const { result } = await this.sessions.open(account, input.userAgent);
    return result;
  }
}
