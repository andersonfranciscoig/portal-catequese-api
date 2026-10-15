import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { FileStorage, UploadPolicy } from "../../../../shared/application/file-storage.js";
import { validateUpload } from "../../../../shared/application/file-validation.js";
import type { Notifier } from "../../../../shared/application/notifier.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import {
  BankAccountNotFoundError,
  PaymentNotFoundError,
  ProofNotFoundError,
} from "../../domain/errors.js";
import type { Payment } from "../../domain/payment.js";
import type { BankAccountRepository, PaymentRepository } from "../../domain/repositories.js";
import { kwanzas, toBankAccountView, toPaymentView, type PaymentView } from "../views.js";

/** O pagamento, se a conta for de quem paga (outros respondem 404). */
async function loadOwn(payments: PaymentRepository, accountId: string, paymentId: string) {
  const payment = await payments.findById(UniqueId.from(paymentId));
  if (!payment?.isPayer(accountId)) throw new PaymentNotFoundError();
  return payment;
}

export class ListMyPaymentsUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute({ accountId }: { accountId: string }): Promise<PaymentView[]> {
    return (await this.payments.listForPayer(accountId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(toPaymentView);
  }
}

/** O pagamento de uma matrícula (pelo número), para quem paga. */
export class GetMyPaymentByCodeUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute({ accountId, code }: { accountId: string; code: string }): Promise<PaymentView> {
    const payment = await this.payments.findByCode(code.trim().toUpperCase());
    if (!payment?.isPayer(accountId)) throw new PaymentNotFoundError();
    return toPaymentView(payment);
  }
}

/** Contas da paróquia ativas (para transferir). */
export class ListActiveBankAccountsUseCase {
  constructor(private readonly accounts: BankAccountRepository) {}

  async execute() {
    return (await this.accounts.list()).filter((item) => item.active).map(toBankAccountView);
  }
}

export interface SubmitProofInput {
  accountId: string;
  paymentId: string;
  bankAccountId: string;
  file?: { name: string; data: Uint8Array };
}

/** A família envia o comprovativo da transferência ou do depósito. */
export class SubmitProofUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly accounts: BankAccountRepository,
    private readonly storage: FileStorage,
    private readonly policy: UploadPolicy,
    private readonly activity: ActivityRecorder,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute({ accountId, paymentId, bankAccountId, file }: SubmitProofInput) {
    const payment = await loadOwn(this.payments, accountId, paymentId);
    const account = await this.accounts.findById(UniqueId.from(bankAccountId));
    if (!account?.active) throw new BankAccountNotFoundError("Escolha uma das contas indicadas.");
    const valid = validateUpload(file, this.policy.maxBytes);
    const stored = await this.storage.upload(
      { ...valid, name: `comprovativo-${payment.enrollmentCode}-${valid.name}` },
      `payments/${payment.id.value}`,
    );
    let previous;
    try {
      previous = payment.submitProof(stored, account.id.value, this.clock.now());
      await this.payments.save(payment);
    } catch (error) {
      await this.storage.delete([stored.key]).catch(() => undefined);
      throw error;
    }
    if (previous) await this.storage.delete([previous.file.key]).catch(() => undefined);

    await this.activity.record({
      actorId: accountId,
      category: "FINANCE",
      action: "payments.proof_submitted",
      summary: `Enviou o comprovativo de ${kwanzas(payment.amount)} da matrícula ${payment.enrollmentCode}`,
    });
    await this.notifier.notify({
      to: { permission: "FINANCE" },
      kind: "payments.proof_submitted",
      title: "Comprovativo para validar",
      body: `${payment.catechumenName} · ${kwanzas(payment.amount)} (${payment.enrollmentCode}) · ${account.bank}`,
      link: `/dashboard/financeiro?pagamento=${payment.id.value}`,
      exceptAccountId: accountId,
    });
    return toPaymentView(payment);
  }
}

export interface ProofFile {
  name: string;
  contentType: string;
  data: Uint8Array;
}

/** O comprovativo, para quem pagou ou para o financeiro (`accountId` ausente). */
export class ReadProofUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute({
    accountId,
    paymentId,
  }: {
    accountId?: string;
    paymentId: string;
  }): Promise<ProofFile> {
    const payment: Payment | null = accountId
      ? await loadOwn(this.payments, accountId, paymentId)
      : await this.payments.findById(UniqueId.from(paymentId));
    if (!payment) throw new PaymentNotFoundError();
    if (!payment.proof) throw new ProofNotFoundError();
    return {
      name: payment.proof.file.name,
      contentType: payment.proof.file.contentType,
      data: await this.storage.read(payment.proof.file.key),
    };
  }
}
