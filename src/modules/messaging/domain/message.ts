import { Entity } from "../../../shared/domain/entity.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import { InvalidMessageError } from "./errors.js";

export const MESSAGE_MAX_LENGTH = 2000;

export interface MessageProps {
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
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
    return new Message({ ...props, body }, UniqueId.create());
  }

  static restore(props: MessageProps, id: UniqueId): Message {
    return new Message({ ...props }, id);
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
}
