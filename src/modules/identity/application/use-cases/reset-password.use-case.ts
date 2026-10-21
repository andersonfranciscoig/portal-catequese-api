import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { Mailer } from "../../../../shared/application/mailer.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { AccountNotFoundError } from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import { Email } from "../../domain/value-objects/email.js";
import { Password } from "../../domain/value-objects/password.js";
import type { EmailChallenges } from "../ports/email-challenges.js";

export interface ResetPasswordInput {
  email: string;
  token: string;
  password: string;
}

/** Define uma nova palavra-passe a partir do link enviado por email. */
export class ResetPasswordUseCase implements UseCase<ResetPasswordInput, void> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly challenges: EmailChallenges,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const email = Email.create(input.email);
    const password = Password.create(input.password);
    const payload = await this.challenges.consumePasswordReset(email.value, input.token);
    const account = await this.accounts.findById(UniqueId.from(payload.accountId));
    if (!account) throw new AccountNotFoundError();

    account.changePassword(await this.hasher.hash(password), this.clock.now());
    await this.accounts.save(account);
    await this.activity.record({
      actorId: account.id.value,
      category: "AUTH",
      action: "identity.password_reset",
      summary: "Redefiniu a palavra-passe",
    });
    if (account.email) {
      this.mailer.sendPasswordChanged({
        email: account.email.value,
        firstName: account.fullName.firstName,
      });
    }
  }
}
