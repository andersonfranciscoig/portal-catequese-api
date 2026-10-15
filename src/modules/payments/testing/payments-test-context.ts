import { UploadPolicy } from "../../../shared/application/file-storage.js";
import { ENROLLMENT_SUBMITTED } from "../../../shared/application/integration-events.js";
import { MemoryFileStorage } from "../../../shared/infrastructure/storage/memory-file-storage.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import { RecordingActivity } from "../../../shared/testing/recording-activity.js";
import { RecordingNotifier } from "../../../shared/testing/recording-notifier.js";
import { CreatePaymentForEnrollmentUseCase } from "../application/use-cases/create-payment.use-case.js";
import {
  GetMyPaymentByCodeUseCase,
  ListActiveBankAccountsUseCase,
  ListMyPaymentsUseCase,
  ReadProofUseCase,
  SubmitProofUseCase,
} from "../application/use-cases/family-payments.use-cases.js";
import {
  DeleteBankAccountUseCase,
  GetFinanceSettingsUseCase,
  ListPaymentsUseCase,
  ReviewPaymentUseCase,
  SaveBankAccountUseCase,
  SetPriceUseCase,
} from "../application/use-cases/finance.use-cases.js";
import {
  InMemoryBankAccountRepository,
  InMemoryPaymentRepository,
  InMemoryPriceRepository,
} from "../infrastructure/persistence/in-memory-payments.repositories.js";

export const IDS = {
  guardian: "00000000-0000-4000-8000-000000000002",
  stranger: "00000000-0000-4000-8000-000000000007",
  finance: "00000000-0000-4000-8000-000000000008",
  enrollment: "00000000-0000-4000-8000-0000000000e1",
};

/** PDF mínimo válido (os primeiros bytes contam). */
export const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF");

export function createPaymentsTestContext() {
  const payments = new InMemoryPaymentRepository();
  const accounts = new InMemoryBankAccountRepository();
  const prices = new InMemoryPriceRepository();
  const storage = new MemoryFileStorage();
  const activity = new RecordingActivity();
  const notifier = new RecordingNotifier();
  const clock = new FixedClock();
  const policy = new UploadPolicy(1024 * 1024);
  const ctx = {
    payments,
    accounts,
    prices,
    storage,
    activity,
    notifier,
    clock,
    create: new CreatePaymentForEnrollmentUseCase(payments, prices, clock),
    mine: new ListMyPaymentsUseCase(payments),
    byCode: new GetMyPaymentByCodeUseCase(payments),
    activeAccounts: new ListActiveBankAccountsUseCase(accounts),
    submitProof: new SubmitProofUseCase(
      payments,
      accounts,
      storage,
      policy,
      activity,
      notifier,
      clock,
    ),
    readProof: new ReadProofUseCase(payments, storage),
    list: new ListPaymentsUseCase(payments),
    review: new ReviewPaymentUseCase(payments, activity, notifier, clock),
    settings: new GetFinanceSettingsUseCase(prices, accounts),
    setPrice: new SetPriceUseCase(prices, activity, clock),
    saveAccount: new SaveBankAccountUseCase(accounts, activity, clock),
    deleteAccount: new DeleteBankAccountUseCase(accounts, activity),

    /** O evento da catequese: matrícula submetida pelo encarregado. */
    async enrollmentSubmitted(purpose: "ENROLLMENT" | "CONFIRMATION" = "ENROLLMENT") {
      await ctx.create.execute({
        name: ENROLLMENT_SUBMITTED,
        aggregateId: IDS.enrollment,
        occurredAt: clock.now(),
        enrollmentCode: "CRP-2026-48200",
        catechumenName: "Inês Francisco",
        purpose,
        payerAccountIds: [IDS.guardian],
      });
      return (await payments.findByEnrollmentId(IDS.enrollment))!;
    },

    async bankAccount(active = true) {
      return ctx.saveAccount.execute({
        actorId: IDS.finance,
        data: {
          bank: "BAI — Banco Angolano de Investimentos",
          holder: "Paróquia Cristo Rei da Paz",
          accountNumber: "1234 5678 9 10 001",
          iban: "AO06 0040 0000 1234 5678 9100 1",
          active,
        },
      });
    },
  };
  return ctx;
}
