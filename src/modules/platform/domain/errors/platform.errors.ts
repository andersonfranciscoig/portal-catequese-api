import { DomainError } from "../../../../shared/domain/domain-error.js";

export class InvalidContactError extends DomainError {
  readonly kind = "validation";
  readonly code = "platform.invalid_contact";
  constructor(message: string) {
    super(message);
  }
}

export class InvalidAccessRequestError extends DomainError {
  readonly kind = "validation";
  readonly code = "platform.invalid_access_request";
  constructor(message: string) {
    super(message);
  }
}

export class DuplicateAccessRequestError extends DomainError {
  readonly kind = "conflict";
  readonly code = "platform.duplicate_access_request";
  constructor(approved: boolean) {
    super(
      approved
        ? "Este contacto já tem acesso aprovado. Pode criar a conta ou entrar."
        : "Já recebemos um pedido com este telefone ou email. Avisamos quando for analisado.",
    );
  }
}

export class AccessRequestNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "platform.access_request_not_found";
  constructor() {
    super("Pedido de acesso não encontrado.");
  }
}

export class AccessRequestAlreadyDecidedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "platform.access_request_already_decided";
  constructor() {
    super("Este pedido já foi decidido.");
  }
}
