import type { Notification } from "../domain/notification.js";

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  createdAt: string;
  readAt?: string;
}

export interface NotificationListView {
  items: NotificationView[];
  unread: number;
}

export function toNotificationView(notification: Notification): NotificationView {
  return {
    id: notification.id.value,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString(),
  };
}
