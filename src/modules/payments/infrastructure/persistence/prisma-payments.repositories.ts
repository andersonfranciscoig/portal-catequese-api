import { Injectable } from "@nestjs/common";

import type { AllowedContentType } from "../../../../shared/application/file-storage.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import type {
  BankAccount as BankAccountRow,
  Payment as PaymentRow,
} from "../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../shared/infrastructure/database/prisma.service.js";
import { BankAccount } from "../../domain/bank-account.js";
import { Payment } from "../../domain/payment.js";
import {
  BankAccountRepository,
  DEFAULT_PRICES,
  PaymentRepository,
  PriceRepository,
  type Prices,
} from "../../domain/repositories.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_ID = "payments";
const orUndefined = <T>(value: T | null) => value ?? undefined;

function toPayment(row: PaymentRow) {
  return Payment.restore(
    {
      enrollmentId: row.enrollmentId,
      enrollmentCode: row.enrollmentCode,
      catechumenName: row.catechumenName,
      purpose: row.purpose,
      amount: row.amount,
      status: row.status,
      method: orUndefined(row.method),
      payerAccountIds: row.payerAccountIds,
      proof:
        row.proofFileKey && row.proofBankAccountId && row.proofSubmittedAt
          ? {
              file: {
                key: row.proofFileKey,
                name: row.proofFileName ?? "comprovativo",
                size: row.proofFileSize ?? 0,
                contentType: (row.proofContentType ?? "application/pdf") as AllowedContentType,
              },
              bankAccountId: row.proofBankAccountId,
              submittedAt: row.proofSubmittedAt,
            }
          : undefined,
      paidAt: orUndefined(row.paidAt),
      reviewNote: orUndefined(row.reviewNote),
      reviewedBy: orUndefined(row.reviewedBy),
      registeredByCoordination: row.registeredByCoordination,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaPaymentRepository extends PaymentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.payment.findUnique({ where: { id: id.value } });
    return row ? toPayment(row) : null;
  }

  async findByEnrollmentId(enrollmentId: string) {
    if (!UUID.test(enrollmentId)) return null;
    const row = await this.prisma.payment.findUnique({ where: { enrollmentId } });
    return row ? toPayment(row) : null;
  }

  async findByCode(enrollmentCode: string) {
    const row = await this.prisma.payment.findFirst({ where: { enrollmentCode } });
    return row ? toPayment(row) : null;
  }

  async listForPayer(accountId: string) {
    if (!UUID.test(accountId)) return [];
    const rows = await this.prisma.payment.findMany({
      where: { payerAccountIds: { has: accountId } },
    });
    return rows.map(toPayment);
  }

  async listAll() {
    const rows = await this.prisma.payment.findMany({ orderBy: { updatedAt: "desc" } });
    return rows.map(toPayment);
  }

  async listForEnrollments(enrollmentIds: string[]) {
    const ids = enrollmentIds.filter((id) => UUID.test(id));
    if (!ids.length) return [];
    const rows = await this.prisma.payment.findMany({ where: { enrollmentId: { in: ids } } });
    return rows.map(toPayment);
  }

  async save(payment: Payment) {
    const data = {
      status: payment.status,
      method: payment.method ?? null,
      amount: payment.amount,
      payerAccountIds: [...payment.payerAccountIds],
      proofFileKey: payment.proof?.file.key ?? null,
      proofFileName: payment.proof?.file.name ?? null,
      proofFileSize: payment.proof?.file.size ?? null,
      proofContentType: payment.proof?.file.contentType ?? null,
      proofBankAccountId: payment.proof?.bankAccountId ?? null,
      proofSubmittedAt: payment.proof?.submittedAt ?? null,
      paidAt: payment.paidAt ?? null,
      reviewNote: payment.reviewNote ?? null,
      reviewedBy: payment.reviewedBy ?? null,
      registeredByCoordination: payment.registeredByCoordination,
      updatedAt: payment.updatedAt,
    };
    await this.prisma.payment.upsert({
      where: { id: payment.id.value },
      create: {
        id: payment.id.value,
        enrollmentId: payment.enrollmentId,
        enrollmentCode: payment.enrollmentCode,
        catechumenName: payment.catechumenName,
        purpose: payment.purpose,
        createdAt: payment.createdAt,
        ...data,
      },
      update: data,
    });
  }
}

function toBankAccount(row: BankAccountRow) {
  return BankAccount.restore(
    {
      bank: row.bank,
      holder: row.holder,
      accountNumber: row.accountNumber,
      iban: row.iban,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueId.from(row.id),
  );
}

@Injectable()
export class PrismaBankAccountRepository extends BankAccountRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: UniqueId) {
    if (!UUID.test(id.value)) return null;
    const row = await this.prisma.bankAccount.findUnique({ where: { id: id.value } });
    return row ? toBankAccount(row) : null;
  }

  async list() {
    const rows = await this.prisma.bankAccount.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toBankAccount);
  }

  async save(account: BankAccount) {
    const data = {
      bank: account.bank,
      holder: account.holder,
      accountNumber: account.accountNumber,
      iban: account.iban,
      active: account.active,
      updatedAt: account.updatedAt,
    };
    await this.prisma.bankAccount.upsert({
      where: { id: account.id.value },
      create: { id: account.id.value, createdAt: account.createdAt, ...data },
      update: data,
    });
  }

  async delete(id: UniqueId) {
    await this.prisma.bankAccount.delete({ where: { id: id.value } });
  }
}

@Injectable()
export class PrismaPriceRepository extends PriceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async get(): Promise<Prices> {
    const row = await this.prisma.paymentSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row
      ? { ENROLLMENT: row.enrollmentPrice, CONFIRMATION: row.confirmationPrice }
      : { ...DEFAULT_PRICES };
  }

  async set(prices: Prices, actorId: string, now: Date) {
    const data = {
      enrollmentPrice: prices.ENROLLMENT,
      confirmationPrice: prices.CONFIRMATION,
      updatedAt: now,
      updatedBy: actorId,
    };
    await this.prisma.paymentSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
  }
}
