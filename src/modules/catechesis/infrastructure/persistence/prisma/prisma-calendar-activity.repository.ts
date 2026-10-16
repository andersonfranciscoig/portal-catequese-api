import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import {
  CalendarActivity,
  type CalendarActivityAudience,
  type CalendarActivityKind,
} from "../../../domain/calendar-activity.js";
import { CalendarActivityRepository } from "../../../domain/repositories/catechesis.repositories.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaCalendarActivityRepository extends CalendarActivityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.calendarActivity.findMany({ orderBy: { startsOn: "asc" } });
    return rows.map(toDomain);
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.calendarActivity.findUnique({ where: { id: id.value } });
    return row ? toDomain(row) : null;
  }

  async save(activity: CalendarActivity) {
    const data = {
      title: activity.title,
      description: activity.description,
      kind: activity.kind,
      audience: activity.audience,
      startsOn: activity.startsOn,
      endsOn: activity.endsOn ?? null,
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
      createdBy: activity.createdBy,
    };
    await this.prisma.calendarActivity.upsert({
      where: { id: activity.id.value },
      create: { id: activity.id.value, ...data },
      update: data,
    });
  }

  async delete(id: UniqueId) {
    if (!UUID.test(id.value)) return false;
    const result = await this.prisma.calendarActivity.deleteMany({ where: { id: id.value } });
    return result.count > 0;
  }
}

function toDomain(row: {
  id: string;
  title: string;
  description: string;
  kind: CalendarActivityKind;
  audience: CalendarActivityAudience;
  startsOn: string;
  endsOn: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}) {
  return CalendarActivity.restore(
    {
      title: row.title,
      description: row.description,
      kind: row.kind,
      audience: row.audience,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
    },
    UniqueId.from(row.id),
  );
}
