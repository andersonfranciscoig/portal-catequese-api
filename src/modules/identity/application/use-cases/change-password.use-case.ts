import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { Mailer } from "../../../../shared/application/mailer.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import {
  AccountNotFoundError,
  IncorrectPasswordError,
  SamePasswordError,
} from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import { Password } from "../../domain/value-objects/password.js";

export interface ChangePasswordInput {
  accountId: string;
  currentPassword: string;
  newPassword: string;
}

export class ChangePasswordUseCase implements UseCase<ChangePasswordInput, void> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const account = await this.accounts.findById(UniqueId.from(input.accountId));
    if (!account) throw new AccountNotFoundError();
    if (!(await this.hasher.matches(input.currentPassword, account.passwordHash))) {
      throw new IncorrectPasswordError();
    }
    if (input.currentPassword === input.newPassword) throw new SamePasswordError();
    const password = Password.create(input.newPassword);

    account.changePassword(await this.hasher.hash(password), this.clock.now());
    await this.accounts.save(account);
    await this.activity.record({
      actorId: account.id.value,
      category: "AUTH",
      action: "identity.password_changed",
      summary: "Mudou a palavra-passe",
    });
    if (account.email) {
      this.mailer.sendPasswordChanged({
        email: account.email.value,
        firstName: account.fullName.firstName,
      });
    }
  }
}
