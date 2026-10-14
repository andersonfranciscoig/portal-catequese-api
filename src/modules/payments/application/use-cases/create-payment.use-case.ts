import type { EnrollmentSubmittedEvent } from "../../../../shared/application/integration-events.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { Payment } from "../../domain/payment.js";
import type { PaymentRepository, PriceRepository } from "../../domain/repositories.js";

/**
 * Cria a taxa a pagar quando uma matrícula ou confirmação é submetida (evento do
 * módulo da catequese), com o preço em vigor. Idempotente por matrícula.
 */
export class CreatePaymentForEnrollmentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly prices: PriceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(event: EnrollmentSubmittedEvent): Promise<void> {
    if (await this.payments.findByEnrollmentId(event.aggregateId)) return;
    const prices = await this.prices.get();
    await this.payments.save(
      Payment.create({
        enrollmentId: event.aggregateId,
        enrollmentCode: event.enrollmentCode,
        catechumenName: event.catechumenName,
        purpose: event.purpose,
        amount: prices[event.purpose],
        payerAccountIds: event.payerAccountIds,
        now: this.clock.now(),
      }),
    );
  }
}
