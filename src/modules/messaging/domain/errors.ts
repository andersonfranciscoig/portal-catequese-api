import { DomainError } from "../../../shared/domain/domain-error.js";

export class ConversationNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "messaging.conversation_not_found";
  constructor() {
    super("Conversa não encontrada.");
  }
}

export class MessageNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "messaging.message_not_found";
  constructor() {
    super("Mensagem não encontrada.");
  }
}

export class ConversationNotAllowedError extends DomainError {
  readonly kind = "forbidden";
  readonly code = "messaging.not_allowed";
  constructor() {
    super("Não pode iniciar uma conversa com esta pessoa.");
  }
}

export class InvalidMessageError extends DomainError {
  readonly kind = "validation";
  readonly code = "messaging.invalid_message";
  constructor(message: string) {
    super(message);
  }
}
