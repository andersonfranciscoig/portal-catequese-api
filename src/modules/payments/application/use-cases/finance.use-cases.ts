import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../shared/application/notifier.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { BankAccount, type BankAccountData } from "../../domain/bank-account.js";
import {
  BankAccountNotFoundError,
  InvalidPriceError,
  PaymentCenterForbiddenError,
  PaymentNotFoundError,
  PaymentParishOnlyError,
} from "../../domain/errors.js";
import type {
  Payment,
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
} from "../../domain/payment.js";
import type {
  BankAccountRepository,
  PaymentRepository,
  PriceRepository,
  Prices,
} from "../../domain/repositories.js";
import {
  kwanzas,
  toBankAccountView,
  toPaymentView,
  type BankAccountView,
  type PaymentView,
} from "../views.js";

/* ───────────── Consulta ───────────── */

export type FinanceScope = { kind: "parish" } | { kind: "center"; centerId: string };

export interface PaymentQuery {
  status?: PaymentStatus;
  method?: PaymentMethod;
  purpose?: PaymentPurpose;
  search?: string;
  /** Centro visível. Sem ele, a lista é a paróquia inteira. */
  centerId?: string;
}

function assertParish(scope?: FinanceScope) {
  if (scope?.kind === "center") throw new PaymentParishOnlyError();
}

export interface PaymentSummary {
  /** Total recebido (pagos), em kwanzas. */
  received: number;
  paidCount: number;
  underReview: number;
  awaiting: number;
  /** Ainda por receber (por pagar + por validar). */
  outstanding: number;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function summarize(payments: Payment[]): PaymentSummary {
  const paid = payments.filter((item) => item.status === "PAID");
  return {
    received: paid.reduce((sum, item) => sum + item.amount, 0),
    paidCount: paid.length,
    underReview: payments.filter((item) => item.status === "UNDER_REVIEW").length,
    awaiting: payments.filter((item) => ["AWAITING_PAYMENT", "REJECTED"].includes(item.status))
      .length,
    outstanding: payments
      .filter((item) => item.status !== "PAID")
      .reduce((sum, item) => sum + item.amount, 0),
  };
}

/** Pagamentos (filtrados) e o resumo de todos. */
export class ListPaymentsUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(query: PaymentQuery): Promise<{ items: PaymentView[]; summary: PaymentSummary }> {
    const all = (await this.payments.listAll()).filter(
      (item) => !query.centerId || item.centerId === query.centerId,
    );
    const search = normalize(query.search?.trim() ?? "");
    const items = all
      .filter(
        (item) =>
          (!query.status || item.status === query.status) &&
          (!query.method || item.method === query.method) &&
          (!query.purpose || item.purpose === query.purpose) &&
          (!search || normalize(`${item.enrollmentCode} ${item.catechumenName}`).includes(search)),
      )
      // Por validar primeiro; depois os mais recentes.
      .sort(
        (a, b) =>
          Number(b.status === "UNDER_REVIEW") - Number(a.status === "UNDER_REVIEW") ||
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
    return { items: items.map(toPaymentView), summary: summarize(all) };
  }
}

/* ───────────── Decisões ───────────── */

export type PaymentReview =
  { kind: "approve" } | { kind: "reject"; reason: string } | { kind: "cash" };

/** Validar o comprovativo, recusá-lo (com motivo) ou registar numerário. */
export class ReviewPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly activity: ActivityRecorder,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute({
    actorId,
    paymentId,
    review,
    scope,
  }: {
    actorId: string;
    paymentId: string;
    review: PaymentReview;
    scope?: FinanceScope;
  }): Promise<PaymentView> {
    const payment = await this.payments.findById(UniqueId.from(paymentId));
    if (!payment) throw new PaymentNotFoundError();
    if (scope?.kind === "center" && payment.centerId !== scope.centerId) {
      throw new PaymentCenterForbiddenError();
    }
    const now = this.clock.now();
    const amount = kwanzas(payment.amount);
    const first = payment.catechumenName.split(" ")[0];

    if (review.kind === "approve") payment.approve(actorId, now);
    else if (review.kind === "reject") payment.reject(actorId, review.reason, now);
    else payment.registerCash(actorId, now);
    await this.payments.save(payment);

    const summary = {
      approve: `Validou o comprovativo de ${amount} (${payment.enrollmentCode})`,
      reject: `Recusou o comprovativo de ${payment.enrollmentCode}`,
      cash: `Registou ${amount} em numerário de ${payment.enrollmentCode}`,
    }[review.kind];
    await this.activity.record({
      actorId,
      category: "FINANCE",
      action: `payments.${review.kind === "cash" ? "cash_registered" : `proof_${review.kind}d`}`,
      summary,
    });
    await this.notifier.notify({
      to: { accountIds: [...payment.payerAccountIds] },
      exceptAccountId: actorId,
      link: "/portal/matriculas",
      ...(review.kind === "reject"
        ? {
            kind: "payments.proof_rejected",
            title: `Comprovativo de ${first} recusado`,
            body: `${review.reason}. Envie outro comprovativo ou pague na secretaria.`,
          }
        : {
            kind: "payments.paid",
            title: `Pagamento de ${first} confirmado`,
            body: `${amount} · ${payment.enrollmentCode}`,
          }),
    });
    return toPaymentView(payment);
  }
}

/* ───────────── Definições (preços e contas) ───────────── */

export interface FinanceSettingsView {
  prices: Prices;
  bankAccounts: BankAccountView[];
}

export class GetFinanceSettingsUseCase {
  constructor(
    private readonly prices: PriceRepository,
    private readonly accounts: BankAccountRepository,
  ) {}

  async execute(): Promise<FinanceSettingsView> {
    const [prices, accounts] = await Promise.all([this.prices.get(), this.accounts.list()]);
    return { prices, bankAccounts: accounts.map(toBankAccountView) };
  }
}

/** Muda o preço (vale para os pagamentos criados a partir de agora). */
export class SetPriceUseCase {
  constructor(
    private readonly prices: PriceRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({
    actorId,
    purpose,
    amount,
    scope,
  }: {
    actorId: string;
    purpose: PaymentPurpose;
    amount: number;
    scope?: FinanceScope;
  }): Promise<Prices> {
    assertParish(scope);
    if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) {
      throw new InvalidPriceError("O preço é um valor inteiro em kwanzas (até 1 000 000).");
    }
    const prices = { ...(await this.prices.get()), [purpose]: amount };
    await this.prices.set(prices, actorId, this.clock.now());
    await this.activity.record({
      actorId,
      category: "FINANCE",
      action: "payments.price_changed",
      summary: `Mudou o preço da ${purpose === "ENROLLMENT" ? "matrícula" : "confirmação"} para ${kwanzas(amount)}`,
    });
    return prices;
  }
}

export class SaveBankAccountUseCase {
  constructor(
    private readonly accounts: BankAccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({
    actorId,
    id,
    data,
    scope,
  }: {
    actorId: string;
    id?: string;
    data: BankAccountData;
    scope?: FinanceScope;
  }): Promise<BankAccountView> {
    assertParish(scope);
    const now = this.clock.now();
    let account: BankAccount;
    if (id) {
      const found = await this.accounts.findById(UniqueId.from(id));
      if (!found) throw new BankAccountNotFoundError();
      found.update(data, now);
      account = found;
    } else {
      account = BankAccount.create(data, now);
    }
    await this.accounts.save(account);
    await this.activity.record({
      actorId,
      category: "FINANCE",
      action: id ? "payments.bank_account_updated" : "payments.bank_account_created",
      summary: `${id ? "Atualizou" : "Acrescentou"} a conta ${account.bank}`,
    });
    return toBankAccountView(account);
  }
}

export class DeleteBankAccountUseCase {
  constructor(
    private readonly accounts: BankAccountRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute({
    actorId,
    id,
    scope,
  }: {
    actorId: string;
    id: string;
    scope?: FinanceScope;
  }): Promise<void> {
    assertParish(scope);
    const account = await this.accounts.findById(UniqueId.from(id));
    if (!account) throw new BankAccountNotFoundError();
    await this.accounts.delete(account.id);
    await this.activity.record({
      actorId,
      category: "FINANCE",
      action: "payments.bank_account_deleted",
      summary: `Removeu a conta ${account.bank}`,
    });
  }
}
