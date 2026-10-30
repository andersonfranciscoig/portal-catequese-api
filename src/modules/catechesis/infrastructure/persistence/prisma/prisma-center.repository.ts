import { Injectable, type OnModuleInit } from "@nestjs/common";

import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { Center, rememberCenterName, type CenterStatus } from "../../../domain/center.js";
import { CenterRepository } from "../../../domain/repositories/catechesis.repositories.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaCenterRepository extends CenterRepository implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async onModuleInit() {
    const rows = await this.prisma.center.findMany({ select: { id: true, name: true } });
    for (const row of rows) rememberCenterName(row.id, row.name);
  }

  async findById(id: string) {
    if (!UUID.test(id)) return null;
    const row = await this.prisma.center.findUnique({ where: { id } });
    return row ? toCenter(row) : null;
  }

  async list(status?: CenterStatus) {
    const rows = await this.prisma.center.findMany({
      where: status ? { status } : undefined,
      orderBy: { name: "asc" },
    });
    return rows.map(toCenter);
  }

  async save(center: Center) {
    rememberCenterName(center.id.value, center.name);
    const data = {
      name: center.name,
      location: center.location,
      status: center.status,
      updatedAt: center.updatedAt,
    };
    await this.prisma.center.upsert({
      where: { id: center.id.value },
      create: { id: center.id.value, createdAt: center.createdAt, ...data },
      update: data,
    });
  }
}

function toCenter(row: {
  id: string;
  name: string;
  location: string;
  status: CenterStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return Center.restore(
    {
      name: row.name,
      location: row.location,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueId.from(row.id),
  );
}
