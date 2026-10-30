import {
  COORDINATION_TEAM_NAME,
  chatRoleOf,
  type ChatPerson,
  type ChatRole,
} from "../domain/chat-policy.js";
import type { Conversation } from "../domain/conversation.js";
import type { Message } from "../domain/message.js";

/** Nome do remetente das mensagens automáticas do portal. */
export const PORTAL_SENDER_NAME = "Portal da Catequese";

/** Uma conta numa conversa; `accountId` e `role` a `null` só nas mensagens automáticas. */
export interface PersonRef {
  accountId: string | null;
  name: string;
  role: ChatRole | null;
}

export interface ContactView {
  kind: "account" | "coordination";
  accountId: string | null;
  name: string;
  role: ChatRole | null;
  context: string | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  sender: PersonRef;
  body: string;
  sentAt: string;
  mine: boolean;
  /** Mensagem do sistema (remetente "Portal da Catequese"). */
  automated: boolean;
}

export interface ConversationView {
  id: string;
  kind: "direct" | "coordination";
  title: string;
  /** `null` quando quem vê é a conta da conversa com a coordenação (o outro lado é a equipa). */
  counterpart: PersonRef | null;
  /** `senderId` a `null` quando a última mensagem é automática. */
  lastMessage: { body: string; sentAt: string; senderId: string | null } | null;
  unreadCount: number;
  updatedAt: string;
}

/** Contas por id (as que já não existem aparecem como "Conta removida"). */
export type People = Map<string, ChatPerson>;

/** Remetente das mensagens automáticas. */
export const PORTAL_SENDER: PersonRef = { accountId: null, name: PORTAL_SENDER_NAME, role: null };

export function personRef(people: People, accountId: string): PersonRef {
  const person = people.get(accountId);
  return person
    ? { accountId, name: person.fullName, role: chatRoleOf(person) }
    : { accountId, name: "Conta removida", role: "GUARDIAN" };
}

/** Contas a consultar para mostrar estas conversas. */
export function peopleIn(conversations: Conversation[]): string[] {
  return conversations.flatMap((conversation) => [
    ...conversation.memberIds,
    ...(conversation.lastMessage?.senderId ? [conversation.lastMessage.senderId] : []),
  ]);
}

/** Remetentes (com conta) destas mensagens. */
export function sendersOf(messages: Message[]): string[] {
  return messages.flatMap((message) => (message.senderId ? [message.senderId] : []));
}

export function toConversationView(
  conversation: Conversation,
  viewerId: string,
  people: People,
  unreadCount: number,
): ConversationView {
  let title: string;
  let counterpart: PersonRef | null;
  if (conversation.kind === "COORDINATION") {
    const subjectId = conversation.subjectAccountId!;
    counterpart = subjectId === viewerId ? null : personRef(people, subjectId);
    title = counterpart?.name ?? COORDINATION_TEAM_NAME;
  } else {
    const otherId = conversation.memberIds.find((id) => id !== viewerId) ?? viewerId;
    counterpart = personRef(people, otherId);
    title = counterpart.name;
  }
  const last = conversation.lastMessage;
  return {
    id: conversation.id.value,
    kind: conversation.kind === "COORDINATION" ? "coordination" : "direct",
    title,
    counterpart,
    lastMessage: last
      ? { body: last.body, sentAt: last.sentAt.toISOString(), senderId: last.senderId }
      : null,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export function toMessageView(message: Message, viewerId: string, people: People): MessageView {
  return {
    id: message.id.value,
    conversationId: message.conversationId,
    sender: message.senderId ? personRef(people, message.senderId) : PORTAL_SENDER,
    body: message.body,
    sentAt: message.createdAt.toISOString(),
    mine: message.senderId !== null && message.senderId === viewerId,
    automated: message.automated,
  };
}
