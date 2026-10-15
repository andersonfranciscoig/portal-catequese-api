import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Notification } from "../../domain/notification.js";
import {
  NotificationRepository,
  type NotificationQuery,
} from "../../domain/repositories/notification.repository.js";

/** Repositório em memória: testes e desenvolvimento sem base de dados. */
export class InMemoryNotificationRepository extends NotificationRepository {
  readonly items = new Map<string, Notification>();

  async saveMany(notifications: Notification[]) {
    for (const item of notifications) this.items.set(item.id.value, item);
  }
  async save(notification: Notification) {
    this.items.set(notification.id.value, notification);
  }
  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }
  async list({ recipientId, unreadOnly, limit, before }: NotificationQuery) {
    return [...this.items.values()]
      .filter(
        (item) =>
          item.recipientId === recipientId &&
          (!unreadOnly || !item.isRead) &&
          (!before || item.createdAt < before),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async countUnread(recipientId: string) {
    return [...this.items.values()].filter(
      (item) => item.recipientId === recipientId && !item.isRead,
    ).length;
  }
  async markAllRead(recipientId: string, now: Date) {
    const unread = [...this.items.values()].filter(
      (item) => item.recipientId === recipientId && !item.isRead,
    );
    unread.forEach((item) => item.markRead(now));
    return unread.length;
  }
}
