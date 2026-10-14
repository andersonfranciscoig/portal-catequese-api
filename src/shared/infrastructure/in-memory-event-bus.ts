import { Logger } from "@nestjs/common";

import { EventBus, type EventHandler } from "../application/event-bus.js";
import type { DomainEvent } from "../domain/domain-event.js";

/**
 * Event bus em processo (monólito). Os módulos subscrevem pelo nome do evento;
 * trocá-lo por um broker não obriga a mudar quem publica nem quem subscreve.
 */
export class InMemoryEventBus extends EventBus {
  private readonly logger = new Logger("EventBus");
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe<E extends DomainEvent>(name: string, handler: EventHandler<E>): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler as EventHandler]);
  }

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const handler of this.handlers.get(event.name) ?? []) {
        try {
          await handler(event);
        } catch (error) {
          // Um subscritor com problemas não desfaz o que já foi gravado.
          this.logger.error(`Falha ao tratar ${event.name}`, error as Error);
        }
      }
    }
  }
}
