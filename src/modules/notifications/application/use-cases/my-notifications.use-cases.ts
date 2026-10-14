import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { NotificationNotFoundError } from "../../domain/errors.js";
import type { NotificationRepository } from "../../domain/repositories/notification.repository.js";
import { toNotificationView, type NotificationListView, type NotificationView } from "../views.js";

export interface ListMyNotificationsInput {
  accountId: string;
  unreadOnly?: boolean;
  limit?: number;
  before?: string;
}

/** O sino: as notificações mais recentes e quantas estão por ler. */
export class ListMyNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute({
    accountId,
    unreadOnly,
    limit = 20,
    before,
  }: ListMyNotificationsInput): Promise<NotificationListView> {
    const [items, unread] = await Promise.all([
      this.notifications.list({
        recipientId: accountId,
        unreadOnly,
        limit: Math.min(Math.max(limit, 1), 50),
        before: before ? new Date(before) : undefined,
      }),
      this.notifications.countUnread(accountId),
    ]);
    return { items: items.map(toNotificationView), unread };
  }
}

export class MarkNotificationReadUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute({
    accountId,
    notificationId,
  }: {
    accountId: string;
    notificationId: string;
  }): Promise<NotificationView> {
    const notification = await this.notifications.findById(UniqueId.from(notificationId));
    // As de outra conta respondem como se não existissem.
    if (!notification || notification.recipientId !== accountId)
      throw new NotificationNotFoundError();
    if (!notification.isRead) {
      notification.markRead(this.clock.now());
      await this.notifications.save(notification);
    }
    return toNotificationView(notification);
  }
}

export class MarkAllNotificationsReadUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ accountId }: { accountId: string }): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(accountId, this.clock.now()) };
  }
}
