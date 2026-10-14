import type { DomainEvent } from "../domain/domain-event.js";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

/**
 * Publicação de eventos entre módulos. Hoje em memória; num cenário de
 * microserviços passa a ser um broker (RabbitMQ, Kafka…) sem mudar os módulos.
 */
export abstract class EventBus {
  abstract publish(events: DomainEvent[]): Promise<void>;
  /** Subscreve um evento pelo nome estável (ex.: "platform.access_request_approved"). */
  abstract subscribe<E extends DomainEvent>(name: string, handler: EventHandler<E>): void;
}
