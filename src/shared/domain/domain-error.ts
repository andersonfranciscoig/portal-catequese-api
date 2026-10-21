/**
 * Tipo de falha de domínio. A camada de apresentação traduz cada tipo para o
 * protocolo (HTTP, mensagens…) sem o domínio conhecer esse protocolo.
 */
export type DomainErrorKind =
  | "validation"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  /** Um serviço de que a ação depende (ex.: armazenamento) não respondeu. */
  | "unavailable"
  /** Pedidos em excesso (ex.: reenvio de código). */
  | "rate_limited";

/** Erro esperado de uma regra de negócio (nunca um bug). */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  /** Código estável para os clientes (ex.: "identity.invalid_credentials"). */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
