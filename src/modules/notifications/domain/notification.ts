import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";

export interface NotificationProps {
  recipientId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  createdAt: Date;
  readAt?: Date;
}

const LIMITS = { title: 160, body: 500, link: 300 };
const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Aviso para uma conta, mostrado no sino até ser lido. */
export class Notification extends AggregateRoot<NotificationProps> {
  static create(props: Omit<NotificationProps, "readAt">): Notification {
    return new Notification({
      ...props,
      title: clip(props.title.trim(), LIMITS.title),
      body: props.body?.trim() ? clip(props.body.trim(), LIMITS.body) : undefined,
      // Só caminhos internos do portal (nunca links externos).
      link:
        props.link?.startsWith("/") && !props.link.startsWith("//")
          ? props.link.slice(0, LIMITS.link)
          : undefined,
    });
  }

  static restore(props: NotificationProps, id: UniqueId): Notification {
    return new Notification({ ...props }, id);
  }

  get recipientId() {
    return this.props.recipientId;
  }
  get kind() {
    return this.props.kind;
  }
  get title() {
    return this.props.title;
  }
  get body() {
    return this.props.body;
  }
  get link() {
    return this.props.link;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get readAt() {
    return this.props.readAt;
  }
  get isRead() {
    return Boolean(this.props.readAt);
  }

  markRead(now: Date) {
    this.props.readAt ??= now;
  }
}
