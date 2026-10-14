import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { Prisma } from "../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../shared/infrastructure/database/prisma.service.js";
import { ActivityEntry } from "../../domain/activity-entry.js";
import {
  ActivityRepository,
  type ActivityQuery,
} from "../../domain/repositories/activity.repository.js";

@Injectable()
export class PrismaActivityRepository extends ActivityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(entry: ActivityEntry) {
    await this.prisma.activityEntry.create({
      data: {
        id: entry.id.value,
        actorId: entry.actorId ?? null,
        category: entry.category,
        action: entry.action,
        summary: entry.summary,
        targetAccountId: entry.targetAccountId ?? null,
        at: entry.at,
      },
    });
  }

  async list(query: ActivityQuery) {
    const and: Prisma.ActivityEntryWhereInput[] = [];
    if (query.actorId) and.push({ actorId: query.actorId });
    if (query.involvingAccountId) {
      and.push({
        OR: [{ actorId: query.involvingAccountId }, { targetAccountId: query.involvingAccountId }],
      });
    }
    if (query.category) and.push({ category: query.category });
    if (query.before) and.push({ at: { lt: query.before } });
    if (query.search) {
      and.push({
        OR: [
          { summary: { contains: query.search, mode: "insensitive" } },
          { action: { contains: query.search, mode: "insensitive" } },
        ],
      });
    }
    const rows = await this.prisma.activityEntry.findMany({
      where: { AND: and },
      orderBy: { at: "desc" },
      take: query.limit,
    });
    return rows.map((row) =>
      ActivityEntry.restore(
        {
          actorId: row.actorId ?? undefined,
          category: row.category,
          action: row.action,
          summary: row.summary,
          targetAccountId: row.targetAccountId ?? undefined,
          at: row.at,
        },
        UniqueId.from(row.id),
      ),
    );
  }
}
