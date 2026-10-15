import {
  PaymentsLedger,
  type PaymentSnapshot,
} from "../../../../shared/application/payments-ledger.js";
import type { PaymentRepository } from "../../domain/repositories.js";

/** Implementação do contrato partilhado `PaymentsLedger`. */
export class PaymentsLedgerService extends PaymentsLedger {
  constructor(private readonly payments: PaymentRepository) {
    super();
  }

  async listForEnrollments(enrollmentIds: string[]): Promise<PaymentSnapshot[]> {
    if (!enrollmentIds.length) return [];
    return (await this.payments.listForEnrollments(enrollmentIds)).map((payment) => ({
      enrollmentId: payment.enrollmentId,
      enrollmentCode: payment.enrollmentCode,
      catechumenName: payment.catechumenName,
      purpose: payment.purpose,
      amount: payment.amount,
      status: payment.status,
      method: payment.method,
      paidAt: payment.paidAt?.toISOString(),
    }));
  }
}
