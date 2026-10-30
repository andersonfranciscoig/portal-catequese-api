import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../shared/infrastructure/database/prisma.service.js";
import {
  PushSubscriptionRepository,
  type PushSubscriptionRecord,
} from "../../domain/push-subscription.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaPushSubscriptionRepository extends PushSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(subscription: PushSubscriptionRecord) {
    const { id, endpoint, ...data } = subscription;
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { id, endpoint, ...data, userAgent: data.userAgent ?? null },
      update: {
        p256dh: data.p256dh,
        auth: data.auth,
        accountId: data.accountId,
        userAgent: data.userAgent ?? null,
      },
    });
  }

  async deleteForAccount(endpoint: string, accountId: string) {
    if (!UUID.test(accountId)) return;
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, accountId } });
  }

  async listForAccounts(accountIds: string[]) {
    const ids = [...new Set(accountIds)].filter((id) => UUID.test(id));
    if (!ids.length) return [];
    const rows = await this.prisma.pushSubscription.findMany({
      where: { accountId: { in: ids } },
    });
    return rows.map((row) => ({ ...row, userAgent: row.userAgent ?? undefined }));
  }

  async deleteByEndpoints(endpoints: string[]) {
    if (!endpoints.length) return;
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: endpoints } } });
  }
}

/** Em memória: testes e desenvolvimento sem base de dados. */
export class InMemoryPushSubscriptionRepository extends PushSubscriptionRepository {
  readonly items = new Map<string, PushSubscriptionRecord>();

  async upsert(subscription: PushSubscriptionRecord) {
    const existing = this.items.get(subscription.endpoint);
    this.items.set(subscription.endpoint, {
      ...subscription,
      id: existing?.id ?? subscription.id,
      createdAt: existing?.createdAt ?? subscription.createdAt,
    });
  }
  async deleteForAccount(endpoint: string, accountId: string) {
    if (this.items.get(endpoint)?.accountId === accountId) this.items.delete(endpoint);
  }
  async listForAccounts(accountIds: string[]) {
    return [...this.items.values()].filter((item) => accountIds.includes(item.accountId));
  }
  async deleteByEndpoints(endpoints: string[]) {
    for (const endpoint of endpoints) this.items.delete(endpoint);
  }
}
