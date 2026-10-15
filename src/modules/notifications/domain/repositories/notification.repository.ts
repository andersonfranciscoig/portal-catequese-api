import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Notification } from "../notification.js";

export interface NotificationQuery {
  recipientId: string;
  unreadOnly?: boolean;
  /** Mais recentes primeiro, até `limit`. */
  limit: number;
  /** Paginação: as anteriores a esta data. */
  before?: Date;
}

export abstract class NotificationRepository {
  abstract saveMany(notifications: Notification[]): Promise<void>;
  abstract findById(id: UniqueId): Promise<Notification | null>;
  abstract list(query: NotificationQuery): Promise<Notification[]>;
  abstract countUnread(recipientId: string): Promise<number>;
  abstract save(notification: Notification): Promise<void>;
  abstract markAllRead(recipientId: string, now: Date): Promise<number>;
}
