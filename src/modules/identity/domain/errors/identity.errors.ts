import { DomainError } from "../../../../shared/domain/domain-error.js";

export class InvalidEmailError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.invalid_email";
  constructor() {
    super("Introduza um email válido.");
  }
}

export class InvalidPhoneNumberError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.invalid_phone";
  constructor() {
    super("Introduza um número de telefone angolano válido (9 dígitos, começa por 9).");
  }
}

export class InvalidFullNameError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.invalid_full_name";
  constructor() {
    super("Escreva o nome e o apelido.");
  }
}

export class WeakPasswordError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.weak_password";
  constructor(reason: string) {
    super(reason);
  }
}

export class AccountAlreadyExistsError extends DomainError {
  readonly kind = "conflict";
  readonly code = "identity.account_already_exists";
  constructor() {
    super("Já existe uma conta com este telefone ou email.");
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly kind = "unauthorized";
  readonly code = "identity.invalid_credentials";
  constructor() {
    super("Telefone/email ou palavra-passe incorretos.");
  }
}

export class InvalidSessionError extends DomainError {
  readonly kind = "unauthorized";
  readonly code = "identity.invalid_session";
  constructor() {
    super("A sessão expirou ou já não é válida. Entre de novo.");
  }
}

export class AccountNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "identity.account_not_found";
  constructor() {
    super("Conta não encontrada.");
  }
}

export class AccountBlockedError extends DomainError {
  readonly kind = "forbidden";
  readonly code = "identity.account_blocked";
  constructor(reason?: string) {
    super(`Esta conta está bloqueada${reason ? `: ${reason}` : "."} Contacte a secretaria.`);
  }
}

export class PortalClosedError extends DomainError {
  readonly kind = "forbidden";
  readonly code = "identity.portal_closed";
  constructor(message?: string) {
    super(message ?? "O portal está temporariamente encerrado.");
  }
}

export class BetaAccessRequiredError extends DomainError {
  readonly kind = "forbidden";
  readonly code = "identity.beta_access_required";
  constructor() {
    super(
      "O portal está em fase de testes e só entram as pessoas aceites pela administração. Pode pedir acesso.",
    );
  }
}

export class IncorrectPasswordError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.incorrect_password";
  constructor() {
    super("A palavra-passe atual não está correta.");
  }
}

export class SamePasswordError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.same_password";
  constructor() {
    super("Escolha uma palavra-passe diferente da atual.");
  }
}

/** A administração não se pode bloquear nem retirar a própria administração. */
export class SelfAdministrationError extends DomainError {
  readonly kind = "conflict";
  readonly code = "identity.self_administration";
  constructor(message: string) {
    super(message);
  }
}

/** Tem de ficar sempre pelo menos uma conta de administração ativa. */
export class LastAdministratorError extends DomainError {
  readonly kind = "conflict";
  readonly code = "identity.last_administrator";
  constructor() {
    super("Tem de existir pelo menos outra conta de administração ativa.");
  }
}

export class NotACatechistError extends DomainError {
  readonly kind = "conflict";
  readonly code = "identity.not_a_catechist";
  constructor() {
    super("Só as contas de catequista precisam de aprovação.");
  }
}

export class NotAdministratorError extends DomainError {
  readonly kind = "forbidden";
  readonly code = "identity.not_administrator";
  constructor() {
    super("Só a administração do portal pode fazer isto.");
  }
}

export class RoleAlreadyAssignedError extends DomainError {
  readonly kind = "conflict";
  readonly code = "identity.role_already_assigned";
  constructor() {
    super("A conta já tem este papel.");
  }
}

export class AccountWithoutRolesError extends DomainError {
  readonly kind = "validation";
  readonly code = "identity.account_without_roles";
  constructor() {
    super("A conta tem de ter pelo menos um papel.");
  }
}
