import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { BankAccount } from "../../domain/bank-account.js";
import type { Payment } from "../../domain/payment.js";
import {
  BankAccountRepository,
  DEFAULT_PRICES,
  PaymentRepository,
  PriceRepository,
  type Prices,
} from "../../domain/repositories.js";

/* Repositórios em memória: testes e desenvolvimento sem base de dados. */

export class InMemoryPaymentRepository extends PaymentRepository {
  readonly items = new Map<string, Payment>();
  private all() {
    return [...this.items.values()];
  }
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async findByEnrollmentId(enrollmentId: string) {
    return this.all().find((item) => item.enrollmentId === enrollmentId) ?? null;
  }
  async findByCode(code: string) {
    return this.all().find((item) => item.enrollmentCode === code) ?? null;
  }
  async listForPayer(accountId: string) {
    return this.all().filter((item) => item.isPayer(accountId));
  }
  async listAll() {
    return this.all();
  }
  async listForEnrollments(enrollmentIds: string[]) {
    return this.all().filter((item) => enrollmentIds.includes(item.enrollmentId));
  }
  async save(payment: Payment) {
    this.items.set(payment.id.value, payment);
  }
}

export class InMemoryBankAccountRepository extends BankAccountRepository {
  readonly items = new Map<string, BankAccount>();
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async list() {
    return [...this.items.values()];
  }
  async save(account: BankAccount) {
    this.items.set(account.id.value, account);
  }
  async delete(id: UniqueId) {
    this.items.delete(id.value);
  }
}

export class InMemoryPriceRepository extends PriceRepository {
  prices: Prices = { ...DEFAULT_PRICES };
  async get() {
    return { ...this.prices };
  }
  async set(prices: Prices) {
    this.prices = { ...prices };
  }
}
