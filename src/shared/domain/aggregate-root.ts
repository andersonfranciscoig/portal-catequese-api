import type { DomainEvent } from "./domain-event.js";
import { Entity } from "./entity.js";

/**
 * Raiz de agregado: a única porta de entrada para alterar o agregado. Regista
 * eventos de domínio, publicados depois de persistir (ver `EventBus`).
 */
export abstract class AggregateRoot<Props extends object> extends Entity<Props> {
  private events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.events.push(event);
  }

  /** Devolve e limpa os eventos pendentes. */
  pullEvents(): DomainEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
