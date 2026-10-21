import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import {
  AccountAlreadyExistsError,
  AccountNotFoundError,
  EmailRequiredError,
} from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import { Email } from "../../domain/value-objects/email.js";
import { FullName } from "../../domain/value-objects/full-name.js";
import { PhoneNumber } from "../../domain/value-objects/phone-number.js";
import { toAccountView, type AccountView } from "../account-view.js";

export interface UpdateProfileInput {
  accountId: string;
  fullName: string;
  phone: string;
  email: string;
}

/** O próprio altera o nome, o telefone ou o email (únicos entre contas). */
export class UpdateProfileUseCase implements UseCase<UpdateProfileInput, AccountView> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateProfileInput): Promise<AccountView> {
    const account = await this.accounts.findById(UniqueId.from(input.accountId));
    if (!account) throw new AccountNotFoundError();
    const fullName = FullName.create(input.fullName);
    const phone = PhoneNumber.create(input.phone);
    if (!input.email?.trim()) throw new EmailRequiredError();
    const email = Email.create(input.email);

    const [byPhone, byEmail] = await Promise.all([
      this.accounts.findByPhone(phone),
      this.accounts.findByEmail(email),
    ]);
    if ((byPhone && !byPhone.equals(account)) || (byEmail && !byEmail.equals(account))) {
      throw new AccountAlreadyExistsError();
    }

    const changed = [
      !account.fullName.equals(fullName) && "nome",
      !account.phone.equals(phone) && "telefone",
      account.email?.value !== email.value && "email",
    ].filter(Boolean);
    account.updateProfile({ fullName, phone, email }, this.clock.now());
    await this.accounts.save(account);
    if (changed.length) {
      await this.activity.record({
        actorId: account.id.value,
        category: "AUTH",
        action: "identity.profile_updated",
        summary: `Atualizou o perfil (${changed.join(", ")})`,
      });
    }
    return toAccountView(account);
  }
}
