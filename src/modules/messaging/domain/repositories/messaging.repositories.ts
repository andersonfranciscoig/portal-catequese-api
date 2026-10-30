import type { Conversation } from "../conversation.js";
import type { Message } from "../message.js";

export abstract class ConversationRepository {
  abstract findById(id: string): Promise<Conversation | null>;
  abstract findDirect(directKey: string): Promise<Conversation | null>;
  abstract findCoordination(subjectAccountId: string): Promise<Conversation | null>;
  /**
   * Grava uma conversa nova. Se, entretanto, outra igual já existir (mesmo par
   * ou mesma conta com a coordenação), devolve essa.
   */
  abstract create(conversation: Conversation): Promise<Conversation>;
  /** Grava a última mensagem e a hora da última atividade. */
  abstract save(conversation: Conversation): Promise<void>;
  /**
   * Conversas que a conta vê, mais recentes primeiro: as diretas em que
   * participa, a sua com a coordenação e, para a equipa, todas as da coordenação.
   */
  abstract listVisibleTo(
    accountId: string,
    isStaff: boolean,
    limit: number,
  ): Promise<Conversation[]>;
  /** Marca como lido até `at` (nunca recua). */
  abstract markRead(conversationId: string, accountId: string, at: Date): Promise<void>;
  /** Mensagens de outros por ler, por conversa (só as que têm alguma). */
  abstract unreadCounts(accountId: string, conversationIds: string[]): Promise<Map<string, number>>;
}

export interface MessagePage {
  /** Da mais antiga para a mais recente. */
  items: Message[];
  hasMore: boolean;
}

export abstract class MessageRepository {
  abstract save(message: Message): Promise<void>;
  abstract findById(id: string): Promise<Message | null>;
  /** As `limit` mais recentes (anteriores a `before`, se indicada). */
  abstract page(
    conversationId: string,
    query: { before?: Message; limit: number },
  ): Promise<MessagePage>;
}
