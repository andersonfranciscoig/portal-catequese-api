import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Notification as NotificationRow } from "../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../shared/infrastructure/database/prisma.service.js";
import { Notification } from "../../domain/notification.js";
import {
  NotificationRepository,
  type NotificationQuery,
} from "../../domain/repositories/notification.repository.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDomain(row: NotificationRow) {
  return Notification.restore(
    {
      recipientId: row.recipientId,
      kind: row.kind,
      title: row.title,
      body: row.body ?? undefined,
      link: row.link ?? undefined,
      createdAt: row.createdAt,
      readAt: row.readAt ?? undefined,
    },
    UniqueId.from(row.id),
  );
}

function toRow(item: Notification) {
  return {
    id: item.id.value,
    recipientId: item.recipientId,
    kind: item.kind,
    title: item.title,
    body: item.body ?? null,
    link: item.link ?? null,
    createdAt: item.createdAt,
    readAt: item.readAt ?? null,
  };
}

@Injectable()
export class PrismaNotificationRepository extends NotificationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async saveMany(notifications: Notification[]) {
    await this.prisma.notification.createMany({ data: notifications.map(toRow) });
  }

  async save(notification: Notification) {
    const { id, ...data } = toRow(notification);
    await this.prisma.notification.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.notification.findUnique({ where: { id: id.value } });
    return row ? toDomain(row) : null;
  }

  async list({ recipientId, unreadOnly, limit, before }: NotificationQuery) {
    if (!UUID.test(recipientId)) return [];
    const rows = await this.prisma.notification.findMany({
      where: {
        recipientId,
        ...(unreadOnly ? { readAt: null } : {}),
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toDomain);
  }

  countUnread(recipientId: string) {
    if (!UUID.test(recipientId)) return Promise.resolve(0);
    return this.prisma.notification.count({ where: { recipientId, readAt: null } });
  }

  async markAllRead(recipientId: string, now: Date) {
    if (!UUID.test(recipientId)) return 0;
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: now },
    });
    return count;
  }
}
