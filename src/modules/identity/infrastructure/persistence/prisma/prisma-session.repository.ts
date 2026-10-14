import { Injectable } from "@nestjs/common";

import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { SessionRepository } from "../../../domain/repositories/session.repository.js";
import type { Session } from "../../../domain/session.js";
import { SessionMapper } from "./session.mapper.js";

@Injectable()
export class PrismaSessionRepository extends SessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByTokenHash(tokenHash: string) {
    const row = await this.prisma.session.findUnique({ where: { tokenHash } });
    return row ? SessionMapper.toDomain(row) : null;
  }

  async save(session: Session) {
    const data = SessionMapper.toPersistence(session);
    await this.prisma.session.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async revokeAllForAccount(accountId: UniqueId, now: Date) {
    await this.prisma.session.updateMany({
      where: { accountId: accountId.value, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
