import { Entity } from "../../../shared/domain/entity.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import { InvalidMessageError } from "./errors.js";

export const MESSAGE_MAX_LENGTH = 2000;

export interface MessageProps {
  conversationId: string;
  /** `null` nas mensagens automáticas do portal (ex.: alerta de chamada por lançar). */
  senderId: string | null;
  body: string;
  createdAt: Date;
  /** Enviada pelo sistema, não por uma pessoa. */
  automated?: boolean;
}

/** Mensagem de uma conversa (texto simples). */
export class Message extends Entity<MessageProps> {
  static create(props: MessageProps): Message {
    const body = props.body.trim();
    if (!body) throw new InvalidMessageError("A mensagem está vazia.");
    if (body.length > MESSAGE_MAX_LENGTH) {
      throw new InvalidMessageError(
        `A mensagem pode ter no máximo ${MESSAGE_MAX_LENGTH} caracteres.`,
      );
    }
    // Sem remetente é sempre automática (e uma automática nunca tem remetente).
    const automated = props.senderId === null || Boolean(props.automated);
    return new Message(
      { ...props, body, automated, senderId: automated ? null : props.senderId },
      UniqueId.create(),
    );
  }

  static restore(props: MessageProps, id: UniqueId): Message {
    return new Message({ ...props, automated: Boolean(props.automated) }, id);
  }

  get conversationId() {
    return this.props.conversationId;
  }
  get senderId() {
    return this.props.senderId;
  }
  get body() {
    return this.props.body;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get automated(): boolean {
    return Boolean(this.props.automated);
  }
}
