import { Module, type OnModuleInit } from "@nestjs/common";

import { ActivityRecorder } from "../../shared/application/activity-recorder.js";
import { EventBus } from "../../shared/application/event-bus.js";
import { FileStorage, UploadPolicy } from "../../shared/application/file-storage.js";
import {
  ENROLLMENT_SUBMITTED,
  type EnrollmentSubmittedEvent,
} from "../../shared/application/integration-events.js";
import { Notifier } from "../../shared/application/notifier.js";
import { PaymentsLedger } from "../../shared/application/payments-ledger.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { IdentityModule } from "../identity/index.js";
import { PaymentsLedgerService } from "./application/services/payments-ledger.service.js";
import { CreatePaymentForEnrollmentUseCase } from "./application/use-cases/create-payment.use-case.js";
import {
  GetMyPaymentByCodeUseCase,
  ListActiveBankAccountsUseCase,
  ListMyPaymentsUseCase,
  ReadProofUseCase,
  SubmitProofUseCase,
} from "./application/use-cases/family-payments.use-cases.js";
import {
  DeleteBankAccountUseCase,
  GetFinanceSettingsUseCase,
  ListPaymentsUseCase,
  ReviewPaymentUseCase,
  SaveBankAccountUseCase,
  SetPriceUseCase,
} from "./application/use-cases/finance.use-cases.js";
import {
  BankAccountRepository,
  PaymentRepository,
  PriceRepository,
} from "./domain/repositories.js";
import {
  PrismaBankAccountRepository,
  PrismaPaymentRepository,
  PrismaPriceRepository,
} from "./infrastructure/persistence/prisma-payments.repositories.js";
import { FinanceController } from "./presentation/http/finance.controller.js";
import { MyPaymentsController } from "./presentation/http/my-payments.controller.js";

const PAYMENTS = PaymentRepository;
const ACCOUNTS = BankAccountRepository;
const PRICES = PriceRepository;
const AUDIT = ActivityRecorder;

/**
 * Módulo dos pagamentos: taxa de cada matrícula e confirmação (criada pelo
 * evento da catequese), comprovativos, numerário, preços e contas da paróquia.
 * O pagamento online (Multicaixa Express) chega quando houver gateway.
 */
@Module({
  imports: [IdentityModule],
  controllers: [MyPaymentsController, FinanceController],
  providers: [
    { provide: PAYMENTS, useClass: PrismaPaymentRepository },
    { provide: ACCOUNTS, useClass: PrismaBankAccountRepository },
    { provide: PRICES, useClass: PrismaPriceRepository },
    provideUseCase(CreatePaymentForEnrollmentUseCase, [PAYMENTS, PRICES, Clock]),
    provideUseCase(ListMyPaymentsUseCase, [PAYMENTS]),
    provideUseCase(GetMyPaymentByCodeUseCase, [PAYMENTS]),
    provideUseCase(ListActiveBankAccountsUseCase, [ACCOUNTS]),
    provideUseCase(SubmitProofUseCase, [
      PAYMENTS,
      ACCOUNTS,
      FileStorage,
      UploadPolicy,
      AUDIT,
      Notifier,
      Clock,
    ]),
    provideUseCase(ReadProofUseCase, [PAYMENTS, FileStorage]),
    provideUseCase(ListPaymentsUseCase, [PAYMENTS]),
    provideUseCase(ReviewPaymentUseCase, [PAYMENTS, AUDIT, Notifier, Clock]),
    provideUseCase(GetFinanceSettingsUseCase, [PRICES, ACCOUNTS]),
    provideUseCase(SetPriceUseCase, [PRICES, AUDIT, Clock]),
    provideUseCase(SaveBankAccountUseCase, [ACCOUNTS, AUDIT, Clock]),
    provideUseCase(DeleteBankAccountUseCase, [ACCOUNTS, AUDIT]),
    // Contrato partilhado: os relatórios da catequese leem os pagamentos por aqui.
    {
      provide: PaymentsLedger,
      inject: [PAYMENTS],
      useFactory: (payments: PaymentRepository) => new PaymentsLedgerService(payments),
    },
  ],
  exports: [PaymentsLedger],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly createPayment: CreatePaymentForEnrollmentUseCase,
  ) {}

  /** Matrícula ou confirmação submetida (catequese): cria a taxa a pagar. */
  onModuleInit() {
    this.events.subscribe<EnrollmentSubmittedEvent>(ENROLLMENT_SUBMITTED, (event) =>
      this.createPayment.execute(event),
    );
  }
}
