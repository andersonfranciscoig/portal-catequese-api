import type { UseCase } from "../../../../shared/application/use-case.js";
import { Email } from "../../domain/value-objects/email.js";
import type { EmailChallenges } from "../ports/email-challenges.js";
import type { AuthResult } from "../session-issuer.js";
import type { RegisterAccountUseCase } from "./register-account.use-case.js";

export interface ConfirmRegistrationInput {
  email: string;
  code: string;
  userAgent?: string;
}

/** Confirma o código enviado por email e cria a conta. */
export class ConfirmRegistrationUseCase implements UseCase<ConfirmRegistrationInput, AuthResult> {
  constructor(
    private readonly challenges: EmailChallenges,
    private readonly register: RegisterAccountUseCase,
  ) {}

  async execute(input: ConfirmRegistrationInput): Promise<AuthResult> {
    const email = Email.create(input.email);
    const payload = await this.challenges.consumeRegister(email.value, input.code);
    return this.register.execute({
      role: payload.role,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      passwordHash: payload.passwordHash,
      centerId: payload.centerId,
      userAgent: input.userAgent,
    });
  }
}
