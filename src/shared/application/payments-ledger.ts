/** Um pagamento visto de fora do módulo dos pagamentos (para relatórios). */
export interface PaymentSnapshot {
  enrollmentId: string;
  enrollmentCode: string;
  catechumenName: string;
  purpose: "ENROLLMENT" | "CONFIRMATION";
  /** Kwanzas. */
  amount: number;
  status: "AWAITING_PAYMENT" | "UNDER_REVIEW" | "PAID" | "REJECTED";
  method?: "EXPRESS_REFERENCE" | "BANK_TRANSFER" | "CASH";
  paidAt?: string;
}

/**
 * Consulta dos pagamentos para os outros módulos (ex.: relatórios da
 * catequese). Contrato partilhado: o módulo `payments` implementa-o.
 */
export abstract class PaymentsLedger {
  /** Pagamentos destas matrículas (as que não têm pagamento ficam de fora). */
  abstract listForEnrollments(enrollmentIds: string[]): Promise<PaymentSnapshot[]>;
}
