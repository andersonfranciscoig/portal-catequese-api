import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { InvalidBankAccountError } from "./errors.js";

export interface BankAccountProps {
  bank: string;
  holder: string;
  accountNumber: string;
  /** IBAN angolano: AO06 + 21 dígitos. */
  iban: string;
  /** Contas inativas deixam de ser mostradas a quem paga. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type BankAccountData = Pick<
  BankAccountProps,
  "bank" | "holder" | "accountNumber" | "iban" | "active"
>;

const IBAN = /^AO06\d{21}$/;

function clean(data: BankAccountData): BankAccountData {
  const bank = data.bank.trim();
  const holder = data.holder.trim();
  const accountNumber = data.accountNumber.trim().replace(/\s+/g, " ");
  const iban = data.iban.replace(/\s+/g, "").toUpperCase();
  if (bank.length < 2 || bank.length > 100) throw new InvalidBankAccountError("Indique o banco.");
  if (holder.length < 2 || holder.length > 100) {
    throw new InvalidBankAccountError("Indique o titular da conta.");
  }
  if (!/^[\d ]{6,30}$/.test(accountNumber)) {
    throw new InvalidBankAccountError("O número da conta só tem algarismos.");
  }
  if (!IBAN.test(iban)) {
    throw new InvalidBankAccountError("O IBAN angolano começa por AO06 e tem 25 caracteres.");
  }
  return { bank, holder, accountNumber, iban, active: data.active };
}

/** Conta da paróquia para transferências e depósitos. */
export class BankAccount extends AggregateRoot<BankAccountProps> {
  static create(data: BankAccountData, now: Date): BankAccount {
    return new BankAccount({ ...clean(data), createdAt: now, updatedAt: now });
  }

  static restore(props: BankAccountProps, id: UniqueId): BankAccount {
    return new BankAccount({ ...props }, id);
  }

  get bank() {
    return this.props.bank;
  }
  get holder() {
    return this.props.holder;
  }
  get accountNumber() {
    return this.props.accountNumber;
  }
  get iban() {
    return this.props.iban;
  }
  get active() {
    return this.props.active;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  update(data: BankAccountData, now: Date) {
    Object.assign(this.props, clean(data), { updatedAt: now });
  }
}
