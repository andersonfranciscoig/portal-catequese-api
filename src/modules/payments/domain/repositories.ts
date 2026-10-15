import type { UniqueId } from "../../../shared/domain/unique-id.js";
import type { BankAccount } from "./bank-account.js";
import type { Payment, PaymentPurpose } from "./payment.js";

export type Prices = Record<PaymentPurpose, number>;

/** Preços por omissão (kwanzas), até a coordenação os mudar. */
export const DEFAULT_PRICES: Prices = { ENROLLMENT: 2500, CONFIRMATION: 1500 };

export abstract class PaymentRepository {
  abstract findById(id: UniqueId): Promise<Payment | null>;
  abstract findByEnrollmentId(enrollmentId: string): Promise<Payment | null>;
  abstract findByCode(enrollmentCode: string): Promise<Payment | null>;
  abstract listForPayer(accountId: string): Promise<Payment[]>;
  abstract listAll(): Promise<Payment[]>;
  abstract listForEnrollments(enrollmentIds: string[]): Promise<Payment[]>;
  abstract save(payment: Payment): Promise<void>;
}

export abstract class BankAccountRepository {
  abstract findById(id: UniqueId): Promise<BankAccount | null>;
  abstract list(): Promise<BankAccount[]>;
  abstract save(account: BankAccount): Promise<void>;
  abstract delete(id: UniqueId): Promise<void>;
}

export abstract class PriceRepository {
  abstract get(): Promise<Prices>;
  abstract set(prices: Prices, actorId: string, now: Date): Promise<void>;
}
