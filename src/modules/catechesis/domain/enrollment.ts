import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import {
  EnrollmentStatus,
  EnrollmentType,
  type CatechesisLevel,
  type SessionSlot,
} from "./catechesis.js";
import { SEDE_CENTER_ID } from "./center.js";
import {
  EnrollmentAlreadyDecidedError,
  InvalidEnrollmentError,
} from "./errors/catechesis.errors.js";

/** Uma mudança de estado (o histórico que a coordenação vê). */
export interface EnrollmentEvent {
  status: EnrollmentStatus;
  at: Date;
  actorId?: string;
  note?: string;
}

export interface EnrollmentProps {
  /** CRP-2026-48213 */
  code: string;
  catechumenId: string;
  catecheticalYear: string;
  level: CatechesisLevel;
  type: EnrollmentType;
  status: EnrollmentStatus;
  preferredSlot: SessionSlot;
  previousParish?: string;
  notes?: string;
  submittedBy: string;
  centerId: string;
  submittedAt: Date;
  classId?: string;
  decidedBy?: string;
  decidedAt?: Date;
  updatedAt: Date;
  /** A família entrega os documentos em papel na secretaria. */
  documentsInPerson: boolean;
  /** Motivo da recusa ou documentos em falta (mostrado à família). */
  reviewNote?: string;
  /** Confirmação: a matrícula do ano anterior que esta continua. */
  previousEnrollmentId?: string;
  history: EnrollmentEvent[];
}

export type SubmitEnrollmentProps = Pick<
  EnrollmentProps,
  | "code"
  | "catechumenId"
  | "catecheticalYear"
  | "level"
  | "type"
  | "preferredSlot"
  | "previousParish"
  | "notes"
  | "submittedBy"
> & { now: Date; documentsInPerson?: boolean; centerId?: string };

export type ConfirmFromPreviousProps = Pick<
  EnrollmentProps,
  "code" | "catechumenId" | "catecheticalYear" | "level" | "preferredSlot" | "submittedBy"
> & { previous: Enrollment; now: Date; centerId?: string };

const S = EnrollmentStatus;
/** Estados em que a coordenação ainda está a decidir. */
const OPEN: EnrollmentStatus[] = [
  S.SUBMITTED,
  S.UNDER_REVIEW,
  S.APPROVED,
  S.PENDING_CONFIRMATION,
  S.WAITLIST,
];

/** Matrícula de um catequizando num ano catequético. */
export class Enrollment extends AggregateRoot<EnrollmentProps> {
  static submit({
    now,
    previousParish,
    notes,
    documentsInPerson,
    ...props
  }: SubmitEnrollmentProps): Enrollment {
    const parish = previousParish?.trim() || undefined;
    if (props.type === EnrollmentType.TRANSFER && !parish) {
      throw new InvalidEnrollmentError("Indique a paróquia de origem da transferência.");
    }
    if (notes && notes.length > 1000) {
      throw new InvalidEnrollmentError("As observações podem ter no máximo 1000 caracteres.");
    }
    return new Enrollment({
      ...props,
      centerId: props.centerId ?? SEDE_CENTER_ID,
      previousParish: parish,
      notes: notes?.trim() || undefined,
      status: S.SUBMITTED,
      submittedAt: now,
      updatedAt: now,
      documentsInPerson: documentsInPerson ?? false,
      history: [{ status: S.SUBMITTED, at: now, actorId: props.submittedBy }],
    });
  }

  /**
   * Confirmação de quem frequentou no ano anterior: já é conhecido, por isso
   * fica logo aprovada (falta só a turma).
   */
  static confirmFromPrevious({
    previous,
    now,
    centerId,
    ...props
  }: ConfirmFromPreviousProps): Enrollment {
    return new Enrollment({
      ...props,
      centerId: centerId ?? previous.centerId,
      type: EnrollmentType.RENEWAL,
      status: S.APPROVED,
      submittedAt: now,
      updatedAt: now,
      documentsInPerson: false,
      previousEnrollmentId: previous.id.value,
      history: [
        {
          status: S.APPROVED,
          at: now,
          actorId: props.submittedBy,
          note: `Confirmação de ${previous.code}`,
        },
      ],
    });
  }

  static restore(props: EnrollmentProps, id: UniqueId): Enrollment {
    return new Enrollment({ ...props, history: [...props.history] }, id);
  }

  get code() {
    return this.props.code;
  }
  get catechumenId() {
    return this.props.catechumenId;
  }
  get catecheticalYear() {
    return this.props.catecheticalYear;
  }
  get level() {
    return this.props.level;
  }
  get type() {
    return this.props.type;
  }
  get status() {
    return this.props.status;
  }
  get preferredSlot() {
    return this.props.preferredSlot;
  }
  get previousParish() {
    return this.props.previousParish;
  }
  get notes() {
    return this.props.notes;
  }
  get submittedBy() {
    return this.props.submittedBy;
  }
  get centerId() {
    return this.props.centerId;
  }
  get submittedAt() {
    return this.props.submittedAt;
  }
  get classId() {
    return this.props.classId;
  }
  get decidedBy() {
    return this.props.decidedBy;
  }
  get decidedAt() {
    return this.props.decidedAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get documentsInPerson() {
    return this.props.documentsInPerson;
  }
  get reviewNote() {
    return this.props.reviewNote;
  }
  get previousEnrollmentId() {
    return this.props.previousEnrollmentId;
  }
  get history(): readonly EnrollmentEvent[] {
    return this.props.history;
  }

  get isConfirmed() {
    return this.props.status === S.CONFIRMED;
  }

  /** Ainda se podem enviar documentos (não recusada). */
  get acceptsDocuments() {
    return this.props.status !== S.REJECTED;
  }

  approve(actorId: string, now: Date) {
    this.move(S.APPROVED, [S.SUBMITTED, S.UNDER_REVIEW, S.PENDING_CONFIRMATION, S.WAITLIST], {
      actorId,
      now,
    });
  }

  /** Faltam documentos: a família é avisada com o que falta. */
  requestDocuments(actorId: string, now: Date, note?: string) {
    this.move(S.PENDING_CONFIRMATION, [S.SUBMITTED, S.UNDER_REVIEW, S.APPROVED], {
      actorId,
      now,
      note: note?.trim() || undefined,
      reviewNote: note?.trim() || undefined,
    });
  }

  waitlist(actorId: string, now: Date) {
    this.move(S.WAITLIST, [S.SUBMITTED, S.UNDER_REVIEW, S.APPROVED, S.PENDING_CONFIRMATION], {
      actorId,
      now,
    });
  }

  /** Volta a analisar uma matrícula recusada ou em lista de espera. */
  reopen(actorId: string, now: Date) {
    this.move(S.UNDER_REVIEW, [S.REJECTED, S.WAITLIST], { actorId, now, classId: null });
  }

  /** A coordenação confirma a matrícula numa turma. */
  confirm(classId: string, actorId: string, now: Date, note?: string) {
    this.move(S.CONFIRMED, OPEN, { actorId, now, note, classId, decided: true });
  }

  reject(actorId: string, now: Date, reason?: string) {
    const note = reason?.trim() || undefined;
    this.move(S.REJECTED, OPEN, {
      actorId,
      now,
      note,
      reviewNote: note,
      classId: null,
      decided: true,
    });
  }

  private move(
    status: EnrollmentStatus,
    from: EnrollmentStatus[],
    change: {
      actorId: string;
      now: Date;
      note?: string;
      reviewNote?: string;
      /** `null` retira a turma. */
      classId?: string | null;
      decided?: boolean;
    },
  ) {
    if (!from.includes(this.props.status)) throw new EnrollmentAlreadyDecidedError();
    this.props.status = status;
    this.props.updatedAt = change.now;
    this.props.reviewNote = change.reviewNote;
    if (change.classId !== undefined) this.props.classId = change.classId ?? undefined;
    if (change.decided) {
      this.props.decidedBy = change.actorId;
      this.props.decidedAt = change.now;
    }
    this.props.history.push({
      status,
      at: change.now,
      actorId: change.actorId,
      note: change.note,
    });
  }
}
