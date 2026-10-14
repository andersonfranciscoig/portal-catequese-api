import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { DomainError } from "../../../../../shared/domain/domain-error.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { Email } from "../../../domain/value-objects/email.js";
import { PhoneNumber } from "../../../domain/value-objects/phone-number.js";

export interface GrantBetaAccessByContactInput {
  phone: string;
  email?: string;
}

/**
 * Um pedido de acesso foi aceite (evento do módulo `platform`): as contas que já
 * existam com esse telefone ou email passam a poder entrar na fase de testes.
 */
export class GrantBetaAccessByContactUseCase implements UseCase<
  GrantBetaAccessByContactInput,
  number
> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ phone, email }: GrantBetaAccessByContactInput): Promise<number> {
    const found = await Promise.all([
      this.accounts.findByPhone(PhoneNumber.create(phone)).catch(ignore),
      email ? this.accounts.findByEmail(Email.create(email)).catch(ignore) : null,
    ]);
    const now = this.clock.now();
    let granted = 0;
    // A mesma conta pode vir pelo telefone e pelo email: junta-se pelo id.
    const unique = new Map(
      found.filter((item) => item !== null).map((account) => [account.id.value, account]),
    );
    for (const account of unique.values()) {
      if (account.betaAccess) continue;
      account.setBetaAccess(true, now);
      await this.accounts.save(account);
      granted += 1;
    }
    return granted;
  }
}

/** Contacto mal formado no pedido: não há conta a encontrar. */
function ignore(_: DomainError) {
  return null;
}
