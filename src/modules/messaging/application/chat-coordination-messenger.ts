import {
  CoordinationMessenger,
  type CoordinationMessage,
} from "../../../shared/application/coordination-messenger.js";
import type { PushNotifier } from "../../../shared/application/push-notifier.js";
import type { RealtimeBus } from "../../../shared/application/realtime-bus.js";
import type { Clock } from "../../../shared/domain/clock.js";
import { Conversation } from "../domain/conversation.js";
import { ConversationNotAllowedError } from "../domain/errors.js";
import { Message } from "../domain/message.js";
import type {
  ConversationRepository,
  MessageRepository,
} from "../domain/repositories/messaging.repositories.js";
import type { ChatAccess } from "./chat-access.js";
import { deliverMessage } from "./message-delivery.js";

/**
 * Implementação da porta `CoordinationMessenger`: escreve na conversa da conta
 * com a coordenação (criando-a), em nome de alguém da equipa ou do portal
 * (mensagem automática), e entrega como qualquer mensagem.
 */
export class ChatCoordinationMessenger extends CoordinationMessenger {
  constructor(
    private readonly access: ChatAccess,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly realtime: RealtimeBus,
    private readonly push: PushNotifier,
    private readonly clock: Clock,
  ) {
    super();
  }

  async post({ toAccountId, body, fromAccountId }: CoordinationMessage) {
    const recipient = (await this.access.people([toAccountId])).get(toAccountId);
    if (!recipient?.active) throw new ConversationNotAllowedError();
    const sender = fromAccountId ? await this.access.viewer(fromAccountId) : null;

    const now = this.clock.now();
    const conversation =
      (await this.conversations.findCoordination(toAccountId)) ??
      (await this.conversations.create(Conversation.coordination(toAccountId, now)));
    const message = Message.create({
      conversationId: conversation.id.value,
      senderId: sender?.id ?? null,
      automated: !sender,
      body,
      createdAt: conversation.nextMessageTime(now),
    });
    await this.messages.save(message);
    conversation.recordMessage(message);
    await this.conversations.save(conversation);
    // Quem escreve leu a conversa até aqui.
    if (sender) {
      await this.conversations.markRead(conversation.id.value, sender.id, message.createdAt);
    }
    await deliverMessage(
      { access: this.access, realtime: this.realtime, push: this.push },
      conversation,
      message,
      sender,
    );
    return { conversationId: conversation.id.value };
  }
}
