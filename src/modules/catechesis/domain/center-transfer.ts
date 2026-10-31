import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import type { CatechesisLevel } from "./catechesis.js";
import type { ClassCatechistRole } from "./catechesis.js";
import {
  CenterTransferAlreadyDecidedError,
  InvalidCenterTransferError,
} from "./errors/catechesis.errors.js";

export const CenterTransferKind = { CATECHUMEN: "CATECHUMEN", CATECHIST: "CATECHIST" } as const;
export type CenterTransferKind = (typeof CenterTransferKind)[keyof typeof CenterTransferKind];

/** Fluxo: origem analisa → destino aceita → concluído. */
export const CenterTransferStatus = {
  ORIGIN_REVIEW: "ORIGIN_REVIEW",
  DESTINATION_REVIEW: "DESTINATION_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type CenterTransferStatus = (typeof CenterTransferStatus)[keyof typeof CenterTransferStatus];

export const OPEN_TRANSFER_STATUSES: CenterTransferStatus[] = [
  "ORIGIN_REVIEW",
  "DESTINATION_REVIEW",
];

export interface CenterTransferProps {
  kind: CenterTransferKind;
  status: CenterTransferStatus;
  requestedBy: string;
  fromCenterId: string;
  toCenterId: string;
  reason: string;
  catechumenId?: string;
  enrollmentId?: string;
  fromClassId?: string;
  fromLevel?: CatechesisLevel;
  toClassId?: string;
  catechistAccountId?: string;
  catechistRole?: ClassCatechistRole;
  requestedAt: Date;
  /** Coordenação de origem encaminhou para o destino. */
  originReviewedAt?: Date;
  originReviewedBy?: string;
  originNote?: string;
  /** Decisão final (destino: aceite/recusa; ou origem: recusa). */
  decidedAt?: Date;
  decidedBy?: string;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const REASON_MAX = 500;

function cleanReason(reason: string) {
  const value = reason.trim().replace(/\s+/g, " ");
  if (value.length < 10 || value.length > REASON_MAX) {
    throw new InvalidCenterTransferError(
      "Explique o motivo da mudança (entre 10 e 500 caracteres).",
    );
  }
  return value;
}

/** Pedido para passar a frequentar outro centro da mesma paróquia. */
export class CenterTransferRequest extends AggregateRoot<CenterTransferProps> {
  static requestCatechumen(input: {
    requestedBy: string;
    fromCenterId: string;
    toCenterId: string;
    reason: string;
    catechumenId: string;
    enrollmentId: string;
    fromClassId?: string;
    fromLevel: CatechesisLevel;
    now: Date;
  }): CenterTransferRequest {
    assertDifferentCenters(input.fromCenterId, input.toCenterId);
    return new CenterTransferRequest({
      kind: "CATECHUMEN",
      status: "ORIGIN_REVIEW",
      requestedBy: input.requestedBy,
      fromCenterId: input.fromCenterId,
      toCenterId: input.toCenterId,
      reason: cleanReason(input.reason),
      catechumenId: input.catechumenId,
      enrollmentId: input.enrollmentId,
      fromClassId: input.fromClassId,
      fromLevel: input.fromLevel,
      requestedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static requestCatechist(input: {
    requestedBy: string;
    fromCenterId: string;
    toCenterId: string;
    reason: string;
    fromClassId?: string;
    fromLevel?: CatechesisLevel;
    now: Date;
  }): CenterTransferRequest {
    assertDifferentCenters(input.fromCenterId, input.toCenterId);
    return new CenterTransferRequest({
      kind: "CATECHIST",
      status: "ORIGIN_REVIEW",
      requestedBy: input.requestedBy,
      fromCenterId: input.fromCenterId,
      toCenterId: input.toCenterId,
      reason: cleanReason(input.reason),
      catechistAccountId: input.requestedBy,
      fromClassId: input.fromClassId,
      fromLevel: input.fromLevel,
      requestedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(props: CenterTransferProps, id: UniqueId): CenterTransferRequest {
    return new CenterTransferRequest({ ...props }, id);
  }

  get kind() {
    return this.props.kind;
  }
  get status() {
    return this.props.status;
  }
  get requestedBy() {
    return this.props.requestedBy;
  }
  get fromCenterId() {
    return this.props.fromCenterId;
  }
  get toCenterId() {
    return this.props.toCenterId;
  }
  get reason() {
    return this.props.reason;
  }
  get catechumenId() {
    return this.props.catechumenId;
  }
  get enrollmentId() {
    return this.props.enrollmentId;
  }
  get fromClassId() {
    return this.props.fromClassId;
  }
  get fromLevel() {
    return this.props.fromLevel;
  }
  get toClassId() {
    return this.props.toClassId;
  }
  get catechistAccountId() {
    return this.props.catechistAccountId;
  }
  get catechistRole() {
    return this.props.catechistRole;
  }
  get requestedAt() {
    return this.props.requestedAt;
  }
  get originReviewedAt() {
    return this.props.originReviewedAt;
  }
  get originReviewedBy() {
    return this.props.originReviewedBy;
  }
  get originNote() {
    return this.props.originNote;
  }
  get decidedAt() {
    return this.props.decidedAt;
  }
  get decidedBy() {
    return this.props.decidedBy;
  }
  get decisionNote() {
    return this.props.decisionNote;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  /** Ainda em análise (origem ou destino). */
  get isOpen() {
    return OPEN_TRANSFER_STATUSES.includes(this.props.status);
  }

  get awaitsOrigin() {
    return this.props.status === "ORIGIN_REVIEW";
  }

  get awaitsDestination() {
    return this.props.status === "DESTINATION_REVIEW";
  }

  /** A coordenação de origem encaminha para o destino. */
  forwardFromOrigin(actorId: string, now: Date, note?: string) {
    if (!this.awaitsOrigin) throw new CenterTransferAlreadyDecidedError();
    this.props.status = "DESTINATION_REVIEW";
    this.props.originReviewedBy = actorId;
    this.props.originReviewedAt = now;
    this.props.originNote = note?.trim() || undefined;
    this.props.updatedAt = now;
  }

  /** Aceite final do centro de destino. */
  approve(
    actorId: string,
    now: Date,
    change: { toClassId?: string; catechistRole?: ClassCatechistRole; note?: string },
  ) {
    if (!this.awaitsDestination) throw new CenterTransferAlreadyDecidedError();
    this.props.status = "APPROVED";
    this.props.decidedBy = actorId;
    this.props.decidedAt = now;
    this.props.decisionNote = change.note?.trim() || undefined;
    this.props.toClassId = change.toClassId;
    this.props.catechistRole = change.catechistRole;
    this.props.updatedAt = now;
  }

  /** Recusa na origem ou no destino. */
  reject(actorId: string, now: Date, note?: string) {
    if (!this.isOpen) throw new CenterTransferAlreadyDecidedError();
    if (this.awaitsOrigin) {
      this.props.originReviewedBy = actorId;
      this.props.originReviewedAt = now;
      this.props.originNote = note?.trim() || undefined;
    }
    this.props.status = "REJECTED";
    this.props.decidedBy = actorId;
    this.props.decidedAt = now;
    this.props.decisionNote = note?.trim() || undefined;
    this.props.updatedAt = now;
  }

  cancel(actorId: string, now: Date) {
    if (actorId !== this.props.requestedBy) {
      throw new InvalidCenterTransferError("Só quem pediu pode cancelar este pedido.");
    }
    if (!this.isOpen) throw new CenterTransferAlreadyDecidedError();
    this.props.status = "CANCELLED";
    this.props.decidedBy = actorId;
    this.props.decidedAt = now;
    this.props.updatedAt = now;
  }
}

function assertDifferentCenters(fromCenterId: string, toCenterId: string) {
  if (fromCenterId === toCenterId) {
    throw new InvalidCenterTransferError("O centro de destino tem de ser diferente do atual.");
  }
}
