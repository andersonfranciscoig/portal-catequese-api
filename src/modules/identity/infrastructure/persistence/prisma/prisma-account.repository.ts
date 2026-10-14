import { Injectable } from "@nestjs/common";

import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { Prisma } from "../../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import type { Account } from "../../../domain/account.js";
import {
  AccountRepository,
  type AccountQuery,
  type AccountStats,
} from "../../../domain/repositories/account.repository.js";
import type { Email } from "../../../domain/value-objects/email.js";
import type { PhoneNumber } from "../../../domain/value-objects/phone-number.js";
import { AccountMapper } from "./account.mapper.js";

@Injectable()
export class PrismaAccountRepository extends AccountRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    const row = await this.prisma.account.findUnique({ where: { id: id.value } });
    return row ? AccountMapper.toDomain(row) : null;
  }

  async findByEmail(email: Email) {
    const row = await this.prisma.account.findUnique({ where: { email: email.value } });
    return row ? AccountMapper.toDomain(row) : null;
  }

  async findByPhone(phone: PhoneNumber) {
    const row = await this.prisma.account.findUnique({ where: { phone: phone.value } });
    return row ? AccountMapper.toDomain(row) : null;
  }

  async save(account: Account) {
    const data = AccountMapper.toPersistence(account);
    await this.prisma.account.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async search(query: AccountQuery) {
    const where = this.where(query);
    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.account.count({ where }),
    ]);
    return { items: rows.map(AccountMapper.toDomain), total };
  }

  async stats(): Promise<AccountStats> {
    const count = (where: Prisma.AccountWhereInput) => this.prisma.account.count({ where });
    const [total, blocked, pendingCatechists, coordination, admins, testers] = await Promise.all([
      count({}),
      count({ status: "BLOCKED" }),
      count({ approval: "PENDING" }),
      count({ permissions: { has: "COORDINATION" } }),
      count({ permissions: { has: "SUPER_ADMIN" }, status: "ACTIVE" }),
      count({ betaAccess: true }),
    ]);
    return { total, blocked, pendingCatechists, coordination, admins, testers };
  }

  countActiveSuperAdmins(exceptId: UniqueId) {
    return this.prisma.account.count({
      where: { permissions: { has: "SUPER_ADMIN" }, status: "ACTIVE", id: { not: exceptId.value } },
    });
  }

  private where(query: AccountQuery): Prisma.AccountWhereInput {
    const search = query.search?.trim();
    const digits = search?.replace(/\D/g, "") ?? "";
    const and: Prisma.AccountWhereInput[] = [];
    if (search) {
      and.push({
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    if (query.role) and.push({ role: query.role });
    if (query.status === "active") and.push({ status: "ACTIVE" });
    if (query.status === "blocked") and.push({ status: "BLOCKED" });
    if (query.status === "pending_approval") and.push({ approval: "PENDING" });
    if (query.access === "admin") and.push({ permissions: { has: "SUPER_ADMIN" } });
    if (query.access === "coordination") and.push({ permissions: { has: "COORDINATION" } });
    if (query.access === "beta") and.push({ betaAccess: true });
    return { AND: and };
  }
}
