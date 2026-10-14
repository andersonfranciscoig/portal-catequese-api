import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { AccessRequest as AccessRequestRow } from "../../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { AccessRequest, type AccessRequestStatus } from "../../../domain/access-request.js";
import { PlatformSettings } from "../../../domain/platform-settings.js";
import { AccessRequestRepository } from "../../../domain/repositories/access-request.repository.js";
import { PlatformSettingsRepository } from "../../../domain/repositories/platform-settings.repository.js";
import { ContactEmail, ContactPhone } from "../../../domain/value-objects/contact.js";

const SETTINGS_ID = PlatformSettings.ID.value;

@Injectable()
export class PrismaPlatformSettingsRepository extends PlatformSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async get() {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) return PlatformSettings.initial();
    return PlatformSettings.restore({
      launchMode: row.launchMode,
      launchChangedAt: row.launchChangedAt ?? undefined,
      launchChangedBy: row.launchChangedBy ?? undefined,
      portalOpen: row.portalOpen,
      closedMessage: row.closedMessage ?? undefined,
      reopensAt: row.reopensAt ?? undefined,
      portalChangedAt: row.portalChangedAt ?? undefined,
      portalChangedBy: row.portalChangedBy ?? undefined,
    });
  }

  async save(settings: PlatformSettings) {
    const data = {
      launchMode: settings.launchMode,
      launchChangedAt: settings.launchChangedAt ?? null,
      launchChangedBy: settings.launchChangedBy ?? null,
      portalOpen: settings.portalOpen,
      closedMessage: settings.closedMessage ?? null,
      reopensAt: settings.reopensAt ?? null,
      portalChangedAt: settings.portalChangedAt ?? null,
      portalChangedBy: settings.portalChangedBy ?? null,
    };
    await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
  }
}

function toDomain(row: AccessRequestRow): AccessRequest {
  return AccessRequest.restore(
    {
      fullName: row.fullName,
      phone: ContactPhone.restore(row.phone),
      email: row.email ? ContactEmail.restore(row.email) : undefined,
      profile: row.profile,
      message: row.message ?? undefined,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt ?? undefined,
      decidedBy: row.decidedBy ?? undefined,
      decisionNote: row.decisionNote ?? undefined,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaAccessRequestRepository extends AccessRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    const row = await this.prisma.accessRequest.findUnique({ where: { id: id.value } });
    return row ? toDomain(row) : null;
  }

  async findOpenByContact(phone: ContactPhone, email?: ContactEmail) {
    const row = await this.prisma.accessRequest.findFirst({
      where: {
        status: { not: "REJECTED" },
        OR: [{ phone: phone.value }, ...(email ? [{ email: email.value }] : [])],
      },
      // Um pedido aceite tem prioridade sobre um por decidir (ordem do enum:
      // PENDING, APPROVED, REJECTED — e os recusados já ficaram de fora).
      orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    });
    return row ? toDomain(row) : null;
  }

  async list(status?: AccessRequestStatus) {
    const rows = await this.prisma.accessRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map(toDomain);
  }

  countPending() {
    return this.prisma.accessRequest.count({ where: { status: "PENDING" } });
  }

  async save(request: AccessRequest) {
    const data = {
      fullName: request.fullName,
      phone: request.phone.value,
      email: request.email?.value ?? null,
      profile: request.profile,
      message: request.message ?? null,
      status: request.status,
      createdAt: request.createdAt,
      decidedAt: request.decidedAt ?? null,
      decidedBy: request.decidedBy ?? null,
      decisionNote: request.decisionNote ?? null,
    };
    await this.prisma.accessRequest.upsert({
      where: { id: request.id.value },
      create: { id: request.id.value, ...data },
      update: data,
    });
  }
}
