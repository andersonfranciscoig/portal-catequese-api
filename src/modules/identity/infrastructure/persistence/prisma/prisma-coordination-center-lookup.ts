import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { CoordinationCenterLookup } from "../../../application/ports/coordination-center-lookup.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaCoordinationCenterLookup extends CoordinationCenterLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(id: string) {
    return (await this.status(id)) !== null;
  }

  async status(id: string) {
    if (!UUID.test(id)) return null;
    const row = await this.prisma.center.findUnique({ where: { id }, select: { status: true } });
    return row?.status ?? null;
  }
}
