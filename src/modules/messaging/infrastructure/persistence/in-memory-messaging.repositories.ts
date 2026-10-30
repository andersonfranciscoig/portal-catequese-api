import type { Conversation } from "../../domain/conversation.js";
import type { Message } from "../../domain/message.js";
import {
  ConversationRepository,
  MessageRepository,
} from "../../domain/repositories/messaging.repositories.js";

const byTime = (a: Message, b: Message) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.value.localeCompare(b.id.value);

/** Mensagens em memória: testes e desenvolvimento sem base de dados. */
export class InMemoryMessageRepository extends MessageRepository {
  readonly items = new Map<string, Message>();

  async save(message: Message) {
    this.items.set(message.id.value, message);
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async page(conversationId: string, { before, limit }: { before?: Message; limit: number }) {
    const all = [...this.items.values()]
      .filter((message) => message.conversationId === conversationId)
      .filter((message) => !before || byTime(message, before) < 0)
      .sort(byTime);
    return { items: all.slice(-limit), hasMore: all.length > limit };
  }
  forConversation(conversationId: string) {
    return [...this.items.values()].filter((message) => message.conversationId === conversationId);
  }
}

/** Conversas em memória (as leituras contam com as mensagens do repositório ao lado). */
export class InMemoryConversationRepository extends ConversationRepository {
  readonly items = new Map<string, Conversation>();
  /** "conversa:conta" → lido até. */
  readonly reads = new Map<string, Date>();

  constructor(private readonly messages: InMemoryMessageRepository) {
    super();
  }

  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findDirect(directKey: string) {
    return [...this.items.values()].find((item) => item.directKey === directKey) ?? null;
  }
  async findCoordination(subjectAccountId: string) {
    return (
      [...this.items.values()].find(
        (item) => item.kind === "COORDINATION" && item.subjectAccountId === subjectAccountId,
      ) ?? null
    );
  }
  async create(conversation: Conversation) {
    const existing = conversation.directKey
      ? await this.findDirect(conversation.directKey)
      : await this.findCoordination(conversation.subjectAccountId!);
    if (existing) return existing;
    this.items.set(conversation.id.value, conversation);
    return conversation;
  }
  async save(conversation: Conversation) {
    this.items.set(conversation.id.value, conversation);
  }
  async listVisibleTo(accountId: string, isStaff: boolean, limit: number) {
    return [...this.items.values()]
      .filter((item) =>
        item.kind === "COORDINATION"
          ? isStaff || item.subjectAccountId === accountId
          : item.memberIds.includes(accountId),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }
  async markRead(conversationId: string, accountId: string, at: Date) {
    const key = `${conversationId}:${accountId}`;
    const current = this.reads.get(key);
    if (!current || current < at) this.reads.set(key, at);
  }
  async unreadCounts(accountId: string, conversationIds: string[]) {
    const counts = new Map<string, number>();
    for (const id of conversationIds) {
      const readAt = this.reads.get(`${id}:${accountId}`);
      const subjectId = this.items.get(id)?.subjectAccountId;
      const count = this.messages.forConversation(id).filter(
        (message) =>
          message.senderId !== accountId &&
          // As automáticas só contam para a conta da conversa.
          (!message.automated || subjectId === accountId) &&
          (!readAt || message.createdAt > readAt),
      ).length;
      if (count) counts.set(id, count);
    }
    return counts;
  }
}
