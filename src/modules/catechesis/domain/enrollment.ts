import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import {
  EnrollmentStatus,
  EnrollmentType,
  type CatechesisLevel,
  type SessionSlot,
} from "./catechesis.js";
import {
  EnrollmentAlreadyDecidedError,
  InvalidEnrollmentError,
} from "./errors/catechesis.errors.js";

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
  submittedAt: Date;
  classId?: string;
  decidedBy?: string;
  decidedAt?: Date;
  updatedAt: Date;
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
> & { now: Date };

/** Estados em que a coordenação ainda pode decidir. */
const OPEN: EnrollmentStatus[] = [
  EnrollmentStatus.SUBMITTED,
  EnrollmentStatus.UNDER_REVIEW,
  EnrollmentStatus.APPROVED,
  EnrollmentStatus.PENDING_CONFIRMATION,
  EnrollmentStatus.WAITLIST,
];

/** Matrícula de um catequizando num ano catequético. */
export class Enrollment extends AggregateRoot<EnrollmentProps> {
  static submit({ now, previousParish, notes, ...props }: SubmitEnrollmentProps): Enrollment {
    const parish = previousParish?.trim() || undefined;
    if (props.type === EnrollmentType.TRANSFER && !parish) {
      throw new InvalidEnrollmentError("Indique a paróquia de origem da transferência.");
    }
    if (notes && notes.length > 1000) {
      throw new InvalidEnrollmentError("As observações podem ter no máximo 1000 caracteres.");
    }
    return new Enrollment({
      ...props,
      previousParish: parish,
      notes: notes?.trim() || undefined,
      status: EnrollmentStatus.SUBMITTED,
      submittedAt: now,
      updatedAt: now,
    });
  }

  static restore(props: EnrollmentProps, id: UniqueId): Enrollment {
    return new Enrollment({ ...props }, id);
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

  get isConfirmed() {
    return this.props.status === EnrollmentStatus.CONFIRMED;
  }

  /** A coordenação confirma a matrícula numa turma. */
  confirm(classId: string, actorId: string, now: Date) {
    this.assertOpen();
    Object.assign(this.props, {
      status: EnrollmentStatus.CONFIRMED,
      classId,
      decidedBy: actorId,
      decidedAt: now,
      updatedAt: now,
    });
  }

  reject(actorId: string, now: Date) {
    this.assertOpen();
    Object.assign(this.props, {
      status: EnrollmentStatus.REJECTED,
      classId: undefined,
      decidedBy: actorId,
      decidedAt: now,
      updatedAt: now,
    });
  }

  private assertOpen() {
    if (!OPEN.includes(this.props.status)) throw new EnrollmentAlreadyDecidedError();
  }
}
