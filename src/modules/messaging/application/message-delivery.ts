import type { PushNotifier, PushPayload } from "../../../shared/application/push-notifier.js";
import type { RealtimeBus } from "../../../shared/application/realtime-bus.js";
import { COORDINATION_TEAM_NAME, isStaff, type ChatPerson } from "../domain/chat-policy.js";
import type { Conversation } from "../domain/conversation.js";
import type { Message } from "../domain/message.js";
import type { ChatAccess } from "./chat-access.js";
import { PORTAL_SENDER_NAME, toMessageView, type People } from "./views.js";

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
 * nome de quem escreveu. Uma mensagem automática (`sender` a `null`) só vai
 * para a conta da conversa, com o título "Portal da Catequese".
 */
export function messagePushes(
  conversation: Conversation,
  message: Message,
  sender: Pick<ChatPerson, "id" | "fullName" | "staff"> | null,
  staffIds: string[],
): PushDelivery[] {
  const conversationId = conversation.id.value;
  const payload = (title: string): PushPayload => ({
    kind: "message",
    title,
    body: truncate(message.body),
    url: `/mensagens?c=${conversationId}`,
    tag: `conv-${conversationId}`,
  });

  const subjectId = conversation.subjectAccountId;
  if (!sender) {
    // A equipa já recebe o resumo dos alertas; o push é só para a conta.
    const recipients = conversation.kind === "COORDINATION" && subjectId ? [subjectId] : [];
    return recipients.length
      ? [{ accountIds: recipients, payload: payload(PORTAL_SENDER_NAME) }]
      : [];
  }

  const recipients = conversation.audience(staffIds).filter((id) => id !== sender.id);
  if (!recipients.length) return [];
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

/**
 * Entrega uma mensagem já gravada: em tempo real a quem vê a conversa e por
 * push (sem esperar). Nunca falha: quem não a recebeu agora vê-a ao abrir.
 */
export async function deliverMessage(
  deps: { access: ChatAccess; realtime: RealtimeBus; push: PushNotifier },
  conversation: Conversation,
  message: Message,
  sender: ChatPerson | null,
): Promise<void> {
  const people: People = new Map(sender ? [[sender.id, sender]] : []);
  try {
    const staffIds = conversation.kind === "COORDINATION" ? await deps.access.staffIds() : [];
    for (const accountId of conversation.audience(staffIds)) {
      deps.realtime.publish(accountId, {
        type: MESSAGE_CREATED,
        data: {
          conversationId: conversation.id.value,
          message: toMessageView(message, accountId, people),
        },
      });
    }
    for (const delivery of messagePushes(conversation, message, sender, staffIds)) {
      // Sem esperar: o push é lento e nunca deve atrasar nem anular o envio.
      void deps.push.send(delivery.accountIds, delivery.payload).catch(() => undefined);
    }
  } catch {
    // A mensagem já está gravada.
  }
}
