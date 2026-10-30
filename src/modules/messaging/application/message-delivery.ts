import type { PushPayload } from "../../../shared/application/push-notifier.js";
import { COORDINATION_TEAM_NAME, isStaff, type ChatPerson } from "../domain/chat-policy.js";
import type { Conversation } from "../domain/conversation.js";
import type { Message } from "../domain/message.js";

/** Eventos em tempo real das mensagens (stream `me/stream`). */
export const MESSAGE_CREATED = "message.created";
export const CONVERSATION_READ = "conversation.read";

const PUSH_BODY_MAX = 120;

export function truncate(text: string, max = PUSH_BODY_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface PushDelivery {
  accountIds: string[];
  payload: PushPayload;
}

/**
 * Notificações push de uma mensagem nova: a todos os que veem a conversa,
 * menos quem a enviou. Na conversa com a coordenação, a conta recebe as
 * respostas da equipa em nome de "Coordenação da catequese"; a equipa vê o
 * nome de quem escreveu.
 */
export function messagePushes(
  conversation: Conversation,
  message: Message,
  sender: Pick<ChatPerson, "id" | "fullName" | "staff">,
  staffIds: string[],
): PushDelivery[] {
  const recipients = conversation.audience(staffIds).filter((id) => id !== sender.id);
  if (!recipients.length) return [];
  const conversationId = conversation.id.value;
  const payload = (title: string): PushPayload => ({
    kind: "message",
    title,
    body: truncate(message.body),
    url: `/mensagens?c=${conversationId}`,
    tag: `conv-${conversationId}`,
  });

  const subjectId = conversation.subjectAccountId;
  if (conversation.kind === "COORDINATION" && isStaff(sender) && subjectId) {
    const team = recipients.filter((id) => id !== subjectId);
    return [
      ...(recipients.includes(subjectId)
        ? [{ accountIds: [subjectId], payload: payload(COORDINATION_TEAM_NAME) }]
        : []),
      ...(team.length ? [{ accountIds: team, payload: payload(sender.fullName) }] : []),
    ];
  }
  return [{ accountIds: recipients, payload: payload(sender.fullName) }];
}
