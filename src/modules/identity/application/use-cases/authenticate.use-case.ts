import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import { DomainError } from "../../../../shared/domain/domain-error.js";
import type { Account } from "../../domain/account.js";
import { InvalidCredentialsError } from "../../domain/errors/identity.errors.js";
import type { AccountRepository } from "../../domain/repositories/account.repository.js";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import { Email } from "../../domain/value-objects/email.js";
import { PhoneNumber } from "../../domain/value-objects/phone-number.js";
import type { AuthResult, SessionIssuer } from "../session-issuer.js";
import type { SignInPolicy } from "../sign-in-policy.js";

export interface AuthenticateInput {
  /** Telefone ou email. */
  identifier: string;
  password: string;
  userAgent?: string;
}

export class AuthenticateUseCase implements UseCase<AuthenticateInput, AuthResult> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly policy: SignInPolicy,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute({ identifier, password, userAgent }: AuthenticateInput): Promise<AuthResult> {
    const account = await this.findAccount(identifier);
    const valid = await this.hasher.matches(password, account?.passwordHash);
    if (!account || !valid) {
      await this.activity.record({
        actorId: account?.id.value,
        category: "AUTH",
        action: "identity.login_failed",
        summary: `Tentativa de entrada falhada com ${identifier.trim().slice(0, 80)}`,
      });
      throw new InvalidCredentialsError();
    }

    try {
      await this.policy.assertCanSignIn(account);
    } catch (error) {
      if (error instanceof DomainError) {
        await this.activity.record({
          actorId: account.id.value,
          category: "AUTH",
          action: "identity.login_denied",
          summary: `Entrada recusada: ${error.message}`,
        });
      }
      throw error;
    }

    const { result } = await this.sessions.open(account, userAgent);
    await this.activity.record({
      actorId: account.id.value,
      category: "AUTH",
      action: "identity.login",
      summary: "Entrou no portal",
    });
    return result;
  }

  private async findAccount(identifier: string): Promise<Account | null> {
    try {
      return identifier.includes("@")
        ? await this.accounts.findByEmail(Email.create(identifier))
        : await this.accounts.findByPhone(PhoneNumber.create(identifier));
    } catch (error) {
      // Identificador mal escrito: responde como credenciais erradas.
      if (error instanceof DomainError) return null;
      throw error;
    }
  }
}
