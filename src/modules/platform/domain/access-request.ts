import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import {
  AccessRequestAlreadyDecidedError,
  InvalidAccessRequestError,
} from "./errors/platform.errors.js";
import { AccessRequestApproved } from "./events/access-request-approved.js";
import type { ContactEmail, ContactPhone } from "./value-objects/contact.js";

export const AccessProfile = {
  GUARDIAN: "GUARDIAN",
  CATECHUMEN: "CATECHUMEN",
  CATECHIST: "CATECHIST",
  COORDINATION: "COORDINATION",
} as const;

export type AccessProfile = (typeof AccessProfile)[keyof typeof AccessProfile];

export type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AccessRequestProps {
  fullName: string;
  phone: ContactPhone;
  email?: ContactEmail;
  profile: AccessProfile;
  message?: string;
  status: AccessRequestStatus;
  createdAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
  decisionNote?: string;
}

export interface SubmitAccessRequestProps {
  fullName: string;
  phone: ContactPhone;
  email?: ContactEmail;
  profile: AccessProfile;
  message?: string;
  now: Date;
}

/** Pedido para participar na fase de testes. */
export class AccessRequest extends AggregateRoot<AccessRequestProps> {
  static submit({ now, fullName, message, ...props }: SubmitAccessRequestProps): AccessRequest {
    const name = fullName.trim().replace(/\s+/g, " ");
    if (name.length > 120 || name.split(" ").length < 2) {
      throw new InvalidAccessRequestError("Escreva o nome e o apelido.");
    }
    if (message && message.length > 500) {
      throw new InvalidAccessRequestError("A mensagem pode ter no máximo 500 caracteres.");
    }
    return new AccessRequest({
      ...props,
      fullName: name,
      message: message?.trim() || undefined,
      status: "PENDING",
      createdAt: now,
    });
  }

  static restore(props: AccessRequestProps, id: UniqueId): AccessRequest {
    return new AccessRequest({ ...props }, id);
  }

  get fullName() {
    return this.props.fullName;
  }
  get phone() {
    return this.props.phone;
  }
  get email() {
    return this.props.email;
  }
  get profile() {
    return this.props.profile;
  }
  get message() {
    return this.props.message;
  }
  get status() {
    return this.props.status;
  }
  get createdAt() {
    return this.props.createdAt;
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

  approve(by: string, now: Date): void {
    this.assertPending();
    this.decide("APPROVED", by, now);
    this.record(
      new AccessRequestApproved(
        this.id.value,
        this.props.phone.value,
        this.props.email?.value,
        now,
      ),
    );
  }

  reject(by: string, note: string | undefined, now: Date): void {
    this.assertPending();
    this.decide("REJECTED", by, now);
    this.props.decisionNote = note?.trim() || undefined;
  }

  private assertPending() {
    if (this.props.status !== "PENDING") throw new AccessRequestAlreadyDecidedError();
  }

  private decide(status: AccessRequestStatus, by: string, now: Date) {
    this.props.status = status;
    this.props.decidedAt = now;
    this.props.decidedBy = by;
  }
}
