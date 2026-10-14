import { EventBus, type EventHandler } from "../application/event-bus.js";
import type { DomainEvent } from "../domain/domain-event.js";

/** Guarda os eventos publicados para os testes verificarem. */
export class RecordingEventBus extends EventBus {
  readonly published: DomainEvent[] = [];
  private readonly handlers = new Map<string, EventHandler[]>();

  async publish(events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
    for (const event of events) {
      for (const handler of this.handlers.get(event.name) ?? []) await handler(event);
    }
  }

  subscribe<E extends DomainEvent>(name: string, handler: EventHandler<E>): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler as EventHandler]);
  }
}
