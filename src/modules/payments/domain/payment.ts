import type { StoredFile } from "../../../shared/application/file-storage.js";
import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { SEDE_CENTER_ID } from "../../../shared/domain/parish-centers.js";
import { InvalidPaymentStateError } from "./errors.js";

type ValueOf<T> = T[keyof T];

export const PaymentPurpose = { ENROLLMENT: "ENROLLMENT", CONFIRMATION: "CONFIRMATION" } as const;
export type PaymentPurpose = ValueOf<typeof PaymentPurpose>;

export const PaymentMethod = {
  /** Multicaixa Express: ainda não disponível (sem gateway). */
  EXPRESS_REFERENCE: "EXPRESS_REFERENCE",
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH",
} as const;
export type PaymentMethod = ValueOf<typeof PaymentMethod>;

export const PaymentStatus = {
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  /** Comprovativo enviado, à espera da validação da coordenação. */
  UNDER_REVIEW: "UNDER_REVIEW",
  PAID: "PAID",
  /** Comprovativo recusado: é preciso pagar ou enviar outro. */
  REJECTED: "REJECTED",
} as const;
export type PaymentStatus = ValueOf<typeof PaymentStatus>;

export interface PaymentProof {
  file: StoredFile;
  bankAccountId: string;
  submittedAt: Date;
}

export interface PaymentProps {
  enrollmentId: string;
  centerId: string;
  enrollmentCode: string;
  catechumenName: string;
  purpose: PaymentPurpose;
  /** Kwanzas. */
  amount: number;
  status: PaymentStatus;
  method?: PaymentMethod;
  /** Quem pode ver e pagar (o encarregado, o próprio adulto). */
  payerAccountIds: string[];
  proof?: PaymentProof;
  paidAt?: Date;
  reviewNote?: string;
  reviewedBy?: string;
  registeredByCoordination: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const P = PaymentStatus;

/** Taxa de uma matrícula ou de uma confirmação. */
export class Payment extends AggregateRoot<PaymentProps> {
  static create(
    props: Pick<
      PaymentProps,
      | "enrollmentId"
      | "enrollmentCode"
      | "catechumenName"
      | "purpose"
      | "amount"
      | "payerAccountIds"
    > & { now: Date; centerId?: string },
  ): Payment {
    const { now, ...rest } = props;
    return new Payment({
      ...rest,
      centerId: rest.centerId ?? SEDE_CENTER_ID,
      payerAccountIds: [...new Set(rest.payerAccountIds)],
      status: P.AWAITING_PAYMENT,
      registeredByCoordination: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: PaymentProps, id: UniqueId): Payment {
    return new Payment({ ...props, payerAccountIds: [...props.payerAccountIds] }, id);
  }

  get enrollmentId() {
    return this.props.enrollmentId;
  }
  get centerId() {
    return this.props.centerId;
  }
  get enrollmentCode() {
    return this.props.enrollmentCode;
  }
  get catechumenName() {
    return this.props.catechumenName;
  }
  get purpose() {
    return this.props.purpose;
  }
  get amount() {
    return this.props.amount;
  }
  get status() {
    return this.props.status;
  }
  get method() {
    return this.props.method;
  }
  get payerAccountIds(): readonly string[] {
    return this.props.payerAccountIds;
  }
  get proof() {
    return this.props.proof;
  }
  get paidAt() {
    return this.props.paidAt;
  }
  get reviewNote() {
    return this.props.reviewNote;
  }
  get reviewedBy() {
    return this.props.reviewedBy;
  }
  get registeredByCoordination() {
    return this.props.registeredByCoordination;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  isPayer(accountId: string) {
    return this.props.payerAccountIds.includes(accountId);
  }

  /**
   * A família envia o comprovativo da transferência. Devolve o comprovativo
   * anterior (recusado), para apagar o ficheiro.
   */
  submitProof(file: StoredFile, bankAccountId: string, now: Date): PaymentProof | undefined {
    if (this.props.status !== P.AWAITING_PAYMENT && this.props.status !== P.REJECTED) {
      throw new InvalidPaymentStateError();
    }
    const previous = this.props.proof;
    Object.assign(this.props, {
      status: P.UNDER_REVIEW,
      method: "BANK_TRANSFER",
      proof: { file, bankAccountId, submittedAt: now },
      reviewNote: undefined,
      updatedAt: now,
    });
    return previous;
  }

  /** A coordenação confirma que o dinheiro entrou. */
  approve(actorId: string, now: Date) {
    if (this.props.status !== P.UNDER_REVIEW) throw new InvalidPaymentStateError();
    Object.assign(this.props, { status: P.PAID, paidAt: now, reviewedBy: actorId, updatedAt: now });
  }

  reject(actorId: string, reason: string, now: Date) {
    if (this.props.status !== P.UNDER_REVIEW) throw new InvalidPaymentStateError();
    Object.assign(this.props, {
      status: P.REJECTED,
      reviewNote: reason.trim(),
      reviewedBy: actorId,
      updatedAt: now,
    });
  }

  /** Pago em numerário na secretaria (registado pela coordenação). */
  registerCash(actorId: string, now: Date) {
    if (this.props.status === P.PAID) throw new InvalidPaymentStateError();
    Object.assign(this.props, {
      status: P.PAID,
      method: "CASH",
      paidAt: now,
      reviewedBy: actorId,
      reviewNote: undefined,
      registeredByCoordination: true,
      updatedAt: now,
    });
  }
}
