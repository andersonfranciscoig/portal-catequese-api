import { DomainError, type DomainErrorKind } from "../../../shared/domain/domain-error.js";

function error(kind: DomainErrorKind, code: string, fallback?: string) {
  return class extends DomainError {
    readonly kind = kind;
    readonly code = `payments.${code}`;
    constructor(message = fallback ?? "") {
      super(message);
    }
  };
}

export class PaymentNotFoundError extends error(
  "not_found",
  "payment_not_found",
  "Pagamento não encontrado.",
) {}
export class InvalidPaymentStateError extends error(
  "conflict",
  "invalid_payment_state",
  "Esta ação não está disponível no estado atual do pagamento.",
) {}
export class BankAccountNotFoundError extends error(
  "not_found",
  "bank_account_not_found",
  "Conta bancária não encontrada.",
) {}
export class InvalidBankAccountError extends error("validation", "invalid_bank_account") {}
export class InvalidPriceError extends error("validation", "invalid_price") {}
export class ProofNotFoundError extends error(
  "not_found",
  "proof_not_found",
  "Este pagamento não tem comprovativo.",
) {}
