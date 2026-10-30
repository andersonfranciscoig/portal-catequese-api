import type { PushNotifier } from "../../../../shared/application/push-notifier.js";
import type { RealtimeBus } from "../../../../shared/application/realtime-bus.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { MessageNotFoundError } from "../../domain/errors.js";
import { Message } from "../../domain/message.js";
import type {
  ConversationRepository,
  MessageRepository,
} from "../../domain/repositories/messaging.repositories.js";
import type { ChatAccess } from "../chat-access.js";
import { CONVERSATION_READ, deliverMessage } from "../message-delivery.js";
import { sendersOf, toMessageView, type MessageView } from "../views.js";

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

/** Mensagens de uma conversa, por páginas (da mais antiga para a mais recente). */
export class ListMessagesUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly messages: MessageRepository,
  ) {}

  async execute(input: {
    accountId: string;
    conversationId: string;
    before?: string;
    limit?: number;
  }): Promise<{ items: MessageView[]; hasMore: boolean }> {
    const viewer = await this.access.viewer(input.accountId);
    const conversation = await this.access.conversation(viewer, input.conversationId);
    let before: Message | undefined;
    if (input.before) {
      const found = await this.messages.findById(input.before);
      if (!found || found.conversationId !== conversation.id.value) {
        throw new MessageNotFoundError();
      }
      before = found;
    }
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = await this.messages.page(conversation.id.value, { before, limit });
    const people = await this.access.people(sendersOf(page.items));
    return {
      items: page.items.map((message) => toMessageView(message, viewer.id, people)),
      hasMore: page.hasMore,
    };
  }
}

/**
 * Envia uma mensagem: grava, entrega em tempo real a quem vê a conversa e
 * envia push a todos menos quem escreveu (o push nunca faz falhar o envio).
 */
export class SendMessageUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly realtime: RealtimeBus,
    private readonly push: PushNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    accountId: string;
    conversationId: string;
    body: string;
  }): Promise<MessageView> {
    const sender = await this.access.viewer(input.accountId);
    const conversation = await this.access.conversation(sender, input.conversationId);
    const message = Message.create({
      conversationId: conversation.id.value,
      senderId: sender.id,
      body: input.body,
      createdAt: conversation.nextMessageTime(this.clock.now()),
    });
    await this.messages.save(message);
    conversation.recordMessage(message);
    await this.conversations.save(conversation);
    // Quem escreve leu a conversa até aqui.
    await this.conversations.markRead(conversation.id.value, sender.id, message.createdAt);

    await deliverMessage(
      { access: this.access, realtime: this.realtime, push: this.push },
      conversation,
      message,
      sender,
    );
    return toMessageView(message, sender.id, new Map([[sender.id, sender]]));
  }
}

/** Marca a conversa como lida por quem pede (cada membro da equipa tem a sua leitura). */
export class MarkConversationReadUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly conversations: ConversationRepository,
    private readonly realtime: RealtimeBus,
    private readonly clock: Clock,
  ) {}

  async execute(input: { accountId: string; conversationId: string }): Promise<void> {
    const viewer = await this.access.viewer(input.accountId);
    const conversation = await this.access.conversation(viewer, input.conversationId);
    const now = this.clock.now();
    const last = conversation.lastMessage?.sentAt;
    await this.conversations.markRead(
      conversation.id.value,
      viewer.id,
      last && last > now ? last : now,
    );
    try {
      const staffIds = conversation.kind === "COORDINATION" ? await this.access.staffIds() : [];
      for (const accountId of conversation.audience(staffIds)) {
        this.realtime.publish(accountId, {
          type: CONVERSATION_READ,
          data: { conversationId: conversation.id.value, accountId: viewer.id },
        });
      }
    } catch {
      // A leitura já ficou gravada.
    }
  }
}
