import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { CenterTransferRequest as TransferRow } from "../../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { CenterTransferRequest } from "../../../domain/center-transfer.js";
import {
  CenterTransferRepository,
  type CenterTransferQuery,
} from "../../../domain/repositories/catechesis.repositories.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRequest(row: TransferRow): CenterTransferRequest {
  return CenterTransferRequest.restore(
    {
      kind: row.kind,
      status: row.status,
      requestedBy: row.requestedBy,
      fromCenterId: row.fromCenterId,
      toCenterId: row.toCenterId,
      reason: row.reason,
      catechumenId: row.catechumenId ?? undefined,
      enrollmentId: row.enrollmentId ?? undefined,
      fromClassId: row.fromClassId ?? undefined,
      fromLevel: row.fromLevel ?? undefined,
      toClassId: row.toClassId ?? undefined,
      catechistAccountId: row.catechistAccountId ?? undefined,
      catechistRole: row.catechistRole ?? undefined,
      requestedAt: row.requestedAt,
      originReviewedAt: row.originReviewedAt ?? undefined,
      originReviewedBy: row.originReviewedBy ?? undefined,
      originNote: row.originNote ?? undefined,
      decidedAt: row.decidedAt ?? undefined,
      decidedBy: row.decidedBy ?? undefined,
      decisionNote: row.decisionNote ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaCenterTransferRepository extends CenterTransferRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.centerTransferRequest.findUnique({ where: { id: id.value } });
    return row ? toRequest(row) : null;
  }

  async list(query: CenterTransferQuery = {}) {
    const rows = await this.prisma.centerTransferRequest.findMany({
      where: {
        status: query.status,
        requestedBy: query.requestedBy,
        catechumenId: query.catechumenId,
        catechistAccountId: query.catechistAccountId,
        fromCenterId: query.fromCenterId,
        toCenterId: query.toCenterId,
      },
      orderBy: { requestedAt: "desc" },
    });
    return rows.map(toRequest);
  }

  async save(request: CenterTransferRequest) {
    const data = {
      kind: request.kind,
      status: request.status,
      requestedBy: request.requestedBy,
      fromCenterId: request.fromCenterId,
      toCenterId: request.toCenterId,
      reason: request.reason,
      catechumenId: request.catechumenId ?? null,
      enrollmentId: request.enrollmentId ?? null,
      fromClassId: request.fromClassId ?? null,
      fromLevel: request.fromLevel ?? null,
      toClassId: request.toClassId ?? null,
      catechistAccountId: request.catechistAccountId ?? null,
      catechistRole: request.catechistRole ?? null,
      requestedAt: request.requestedAt,
      originReviewedAt: request.originReviewedAt ?? null,
      originReviewedBy: request.originReviewedBy ?? null,
      originNote: request.originNote ?? null,
      decidedAt: request.decidedAt ?? null,
      decidedBy: request.decidedBy ?? null,
      decisionNote: request.decisionNote ?? null,
      updatedAt: request.updatedAt,
    };
    await this.prisma.centerTransferRequest.upsert({
      where: { id: request.id.value },
      create: { id: request.id.value, createdAt: request.createdAt, ...data },
      update: data,
    });
  }
}
