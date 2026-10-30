import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { SEDE_CENTER_ID } from "./center.js";
import { InvalidAnnouncementError } from "./errors/catechesis.errors.js";

/** Quem recebe o aviso no portal. */
export const AnnouncementAudience = {
  ALL: "ALL",
  GUARDIANS: "GUARDIANS",
  CATECHUMENS: "CATECHUMENS",
  CATECHISTS: "CATECHISTS",
} as const;

export type AnnouncementAudience = (typeof AnnouncementAudience)[keyof typeof AnnouncementAudience];

/** O portal mostra sempre a coordenação, não o nome de quem publicou. */
export const ANNOUNCEMENT_AUTHOR = "Coordenação da catequese";

export interface AnnouncementProps {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  author: string;
  publishedAt: Date;
  updatedAt: Date;
  createdBy: string;
  centerId: string;
}

export class Announcement extends AggregateRoot<AnnouncementProps> {
  static create(input: {
    title: string;
    body: string;
    audience: AnnouncementAudience;
    pinned: boolean;
    createdBy: string;
    centerId?: string;
    now: Date;
  }): Announcement {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 3 || title.length > 80) {
      throw new InvalidAnnouncementError("Escreva um título (pelo menos 3 letras).");
    }
    if (body.length < 10 || body.length > 600) {
      throw new InvalidAnnouncementError("Escreva a mensagem (pelo menos 10 caracteres).");
    }
    return new Announcement({
      title,
      body,
      audience: input.audience,
      pinned: input.pinned,
      author: ANNOUNCEMENT_AUTHOR,
      publishedAt: input.now,
      updatedAt: input.now,
      createdBy: input.createdBy,
      centerId: input.centerId ?? SEDE_CENTER_ID,
    });
  }

  static restore(props: AnnouncementProps, id: UniqueId): Announcement {
    return new Announcement(props, id);
  }

  get title() {
    return this.props.title;
  }
  get body() {
    return this.props.body;
  }
  get audience() {
    return this.props.audience;
  }
  get pinned() {
    return this.props.pinned;
  }
  get author() {
    return this.props.author;
  }
  get publishedAt() {
    return this.props.publishedAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get createdBy() {
    return this.props.createdBy;
  }
  get centerId() {
    return this.props.centerId;
  }

  setPinned(pinned: boolean, now: Date) {
    if (this.props.pinned === pinned) return;
    this.props.pinned = pinned;
    this.props.updatedAt = now;
  }
}
