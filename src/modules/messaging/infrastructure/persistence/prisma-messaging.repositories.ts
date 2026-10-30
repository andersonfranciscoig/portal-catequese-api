import { Injectable } from "@nestjs/common";

import { UniqueId } from "../../../../shared/domain/unique-id.js";
import type {
  Conversation as ConversationRow,
  Message as MessageRow,
} from "../../../../shared/infrastructure/database/generated/client.js";
import { PrismaService } from "../../../../shared/infrastructure/database/prisma.service.js";
import { SEDE_CENTER_ID } from "../../../../shared/domain/parish-centers.js";
import { Conversation } from "../../domain/conversation.js";
import { Message } from "../../domain/message.js";
import {
  ConversationRepository,
  MessageRepository,
} from "../../domain/repositories/messaging.repositories.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toConversation(row: ConversationRow): Conversation {
  return Conversation.restore(
    {
      kind: row.kind,
      directKey: row.directKey ?? undefined,
      subjectAccountId: row.subjectAccountId ?? undefined,
      centerId: row.centerId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastMessage:
        // Sem remetente: a última é uma mensagem automática.
        row.lastMessageAt && row.lastMessageBody !== null
          ? {
              body: row.lastMessageBody,
              sentAt: row.lastMessageAt,
              senderId: row.lastMessageSenderId,
            }
          : undefined,
    },
    UniqueId.from(row.id),
  );
}

function toMessage(row: MessageRow): Message {
  return Message.restore(
    {
      conversationId: row.conversationId,
      senderId: row.senderId,
      body: row.body,
      createdAt: row.createdAt,
      automated: row.automated,
    },
    UniqueId.from(row.id),
  );
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === "P2002";

@Injectable()
export class PrismaConversationRepository extends ConversationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string) {
    if (!UUID.test(id)) return null;
    const row = await this.prisma.conversation.findUnique({ where: { id } });
    return row ? toConversation(row) : null;
  }

  async findDirect(directKey: string) {
    const row = await this.prisma.conversation.findUnique({ where: { directKey } });
    return row ? toConversation(row) : null;
  }

  async findCoordination(subjectAccountId: string, centerId = SEDE_CENTER_ID) {
    if (!UUID.test(subjectAccountId)) return null;
    const row = await this.prisma.conversation.findFirst({
      where: { kind: "COORDINATION", subjectAccountId, centerId },
    });
    return row ? toConversation(row) : null;
  }

  async create(conversation: Conversation) {
    try {
      await this.prisma.conversation.create({
        data: {
          id: conversation.id.value,
          kind: conversation.kind,
          directKey: conversation.directKey ?? null,
          subjectAccountId: conversation.subjectAccountId ?? null,
          centerId: conversation.centerId ?? null,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          members: {
            create: conversation.memberIds.map((accountId) => ({ accountId })),
          },
        },
      });
      return conversation;
    } catch (error) {
      // Dois pedidos ao mesmo tempo: fica a que chegou primeiro.
      if (!isUniqueViolation(error)) throw error;
      const existing = conversation.directKey
        ? await this.findDirect(conversation.directKey)
        : await this.findCoordination(conversation.subjectAccountId!, conversation.centerId);
      if (!existing) throw error;
      return existing;
    }
  }

  async save(conversation: Conversation) {
    const last = conversation.lastMessage;
    await this.prisma.conversation.update({
      where: { id: conversation.id.value },
      data: {
        updatedAt: conversation.updatedAt,
        lastMessageBody: last?.body ?? null,
        lastMessageAt: last?.sentAt ?? null,
        lastMessageSenderId: last?.senderId ?? null,
      },
    });
  }

  async listVisibleTo(accountId: string, isStaff: boolean, limit: number, staffCenterId?: string) {
    if (!UUID.test(accountId)) return [];
    const staff =
      isStaff
        ? [{ kind: "COORDINATION" as const, ...(staffCenterId ? { centerId: staffCenterId } : {}) }]
        : [];
    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { kind: "DIRECT", members: { some: { accountId } } },
          { kind: "COORDINATION", subjectAccountId: accountId },
          ...staff,
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(toConversation);
  }

  async markRead(conversationId: string, accountId: string, at: Date) {
    if (!UUID.test(conversationId) || !UUID.test(accountId)) return;
    // Cria a leitura (ex.: primeiro membro da equipa a abrir) e nunca a faz recuar.
    await this.prisma.$executeRaw`
      INSERT INTO "messaging"."conversation_members" ("conversation_id", "account_id", "last_read_at")
      VALUES (${conversationId}::uuid, ${accountId}::uuid, ${at})
      ON CONFLICT ("conversation_id", "account_id") DO UPDATE
      SET "last_read_at" = GREATEST("messaging"."conversation_members"."last_read_at", EXCLUDED."last_read_at")`;
  }

  async unreadCounts(accountId: string, conversationIds: string[]) {
    const ids = [...new Set(conversationIds)].filter((id) => UUID.test(id));
    if (!UUID.test(accountId) || !ids.length) return new Map<string, number>();
    // As mensagens automáticas (sem remetente) contam como por ler só para a
    // conta da conversa; a equipa recebe o resumo dos alertas à parte.
    const rows = await this.prisma.$queryRaw<{ conversation_id: string; count: number }[]>`
      SELECT m."conversation_id", COUNT(*)::int AS "count"
      FROM "messaging"."messages" m
      JOIN "messaging"."conversations" c ON c."id" = m."conversation_id"
      LEFT JOIN "messaging"."conversation_members" r
        ON r."conversation_id" = m."conversation_id" AND r."account_id" = ${accountId}::uuid
      WHERE m."conversation_id" = ANY(${ids}::uuid[])
        AND m."sender_id" IS DISTINCT FROM ${accountId}::uuid
        AND (NOT m."automated" OR c."subject_account_id" = ${accountId}::uuid)
        AND (r."last_read_at" IS NULL OR m."created_at" > r."last_read_at")
      GROUP BY m."conversation_id"`;
    return new Map(rows.map((row) => [row.conversation_id, Number(row.count)]));
  }
}

@Injectable()
export class PrismaMessageRepository extends MessageRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(message: Message) {
    await this.prisma.message.create({
      data: {
        id: message.id.value,
        conversationId: message.conversationId,
        senderId: message.senderId,
        automated: message.automated,
        body: message.body,
        createdAt: message.createdAt,
      },
    });
  }

  async findById(id: string) {
    if (!UUID.test(id)) return null;
    const row = await this.prisma.message.findUnique({ where: { id } });
    return row ? toMessage(row) : null;
  }

  async page(conversationId: string, { before, limit }: { before?: Message; limit: number }) {
    if (!UUID.test(conversationId)) return { items: [], hasMore: false };
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id.value } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).reverse().map(toMessage),
      hasMore: rows.length > limit,
    };
  }
}
