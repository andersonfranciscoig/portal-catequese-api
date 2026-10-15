import type { BankAccount } from "../domain/bank-account.js";
import type { Payment } from "../domain/payment.js";

export interface PaymentView {
  id: string;
  enrollmentId: string;
  enrollmentCode: string;
  catechumenName: string;
  purpose: Payment["purpose"];
  amount: number;
  status: Payment["status"];
  method?: Payment["method"];
  proof?: {
    fileName: string;
    fileSize: number;
    fileType: string;
    bankAccountId: string;
    submittedAt: string;
  };
  paidAt?: string;
  reviewNote?: string;
  registeredByCoordination: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountView {
  id: string;
  bank: string;
  holder: string;
  accountNumber: string;
  iban: string;
  active: boolean;
}

export function toPaymentView(payment: Payment): PaymentView {
  return {
    id: payment.id.value,
    enrollmentId: payment.enrollmentId,
    enrollmentCode: payment.enrollmentCode,
    catechumenName: payment.catechumenName,
    purpose: payment.purpose,
    amount: payment.amount,
    status: payment.status,
    method: payment.method,
    proof: payment.proof
      ? {
          fileName: payment.proof.file.name,
          fileSize: payment.proof.file.size,
          fileType: payment.proof.file.contentType,
          bankAccountId: payment.proof.bankAccountId,
          submittedAt: payment.proof.submittedAt.toISOString(),
        }
      : undefined,
    paidAt: payment.paidAt?.toISOString(),
    reviewNote: payment.reviewNote,
    registeredByCoordination: payment.registeredByCoordination,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export function toBankAccountView(account: BankAccount): BankAccountView {
  return {
    id: account.id.value,
    bank: account.bank,
    holder: account.holder,
    accountNumber: account.accountNumber,
    iban: account.iban,
    active: account.active,
  };
}

/** "2 500 Kz" */
export const kwanzas = (value: number) => `${value.toLocaleString("pt-PT").replace(/\s/g, " ")} Kz`;
