import type { Mailer } from "../../../../shared/application/mailer.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
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
import { assertActiveHomeCenter } from "../home-center.js";
import type { EmailChallenges } from "../ports/email-challenges.js";
import type { CoordinationCenterLookup } from "../ports/coordination-center-lookup.js";
import type { RegisterAccountInput } from "./register-account.use-case.js";
import type { SignInPolicy } from "../sign-in-policy.js";

export interface RequestRegistrationResult {
  email: string;
  expiresInSec: number;
}

/**
 * Guarda os dados do registo e envia um código de 6 dígitos. A conta só nasce
 * quando o código é confirmado.
 */
export class RequestRegistrationUseCase implements UseCase<
  RegisterAccountInput,
  RequestRegistrationResult
> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly policy: SignInPolicy,
    private readonly challenges: EmailChallenges,
    private readonly mailer: Mailer,
    private readonly centers: CoordinationCenterLookup,
  ) {}

  async execute(input: RegisterAccountInput): Promise<RequestRegistrationResult> {
    const fullName = FullName.create(input.fullName);
    const phone = PhoneNumber.create(input.phone);
    if (!input.email?.trim()) throw new EmailRequiredError();
    const email = Email.create(input.email);
    await assertActiveHomeCenter(this.centers, input.centerId);
    const password = Password.create(input.password ?? "");

    const [byPhone, byEmail] = await Promise.all([
      this.accounts.findByPhone(phone),
      this.accounts.findByEmail(email),
    ]);
    if (byPhone || byEmail) throw new AccountAlreadyExistsError();
    const { betaAccess } = await this.policy.assertCanRegister(phone.value, email.value);

    const { code, expiresInSec } = await this.challenges.issueRegister(email.value, {
      role: input.role,
      fullName: fullName.value,
      phone: phone.value,
      email: email.value,
      passwordHash: await this.hasher.hash(password),
      betaAccess,
      centerId: input.centerId,
    });

    this.mailer.sendRegisterOtp({
      email: email.value,
      firstName: fullName.firstName,
      otp: code,
    });

    return { email: email.value, expiresInSec };
  }
}
