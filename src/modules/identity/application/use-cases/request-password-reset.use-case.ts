import type { Mailer } from "../../../../shared/application/mailer.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import { Email } from "../../domain/value-objects/email.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import type { EmailChallenges } from "../ports/email-challenges.js";

export interface RequestPasswordResetInput {
  email: string;
}

/**
 * Pede a recuperação da palavra-passe. A resposta é sempre a mesma, para não
 * revelar se o email tem conta.
 */
export class RequestPasswordResetUseCase implements UseCase<RequestPasswordResetInput, void> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly challenges: EmailChallenges,
    private readonly mailer: Mailer,
  ) {}

  async execute({ email }: RequestPasswordResetInput): Promise<void> {
    const address = Email.create(email);
    const account = await this.accounts.findByEmail(address);
    if (!account) return;

    const { code } = await this.challenges.issuePasswordReset(address.value, {
      accountId: account.id.value,
      firstName: account.fullName.firstName,
    });
    this.mailer.sendPasswordReset({
      email: address.value,
      firstName: account.fullName.firstName,
      token: code,
    });
  }
}
