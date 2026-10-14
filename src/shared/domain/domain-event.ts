/** Algo que aconteceu no domínio e que outros módulos podem querer saber. */
export interface DomainEvent {
  /** Nome estável do evento (ex.: "identity.account_registered"). */
  readonly name: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
}
