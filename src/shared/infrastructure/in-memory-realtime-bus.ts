import { Logger } from "@nestjs/common";
import { Subject, filter } from "rxjs";

import {
  RealtimeBus,
  type RealtimeEvent,
  type RealtimeListener,
} from "../application/realtime-bus.js";

interface Envelope {
  accountId: string;
  event: RealtimeEvent;
}

/**
 * Eventos em tempo real em processo (uma instância da API). Para várias
 * instâncias, troca-se por uma implementação sobre Redis pub/sub com o mesmo
 * contrato.
 */
export class InMemoryRealtimeBus extends RealtimeBus {
  private readonly logger = new Logger("Realtime");
  private readonly stream = new Subject<Envelope>();

  publish(accountId: string, event: RealtimeEvent): void {
    try {
      this.stream.next({ accountId, event });
    } catch (error) {
      this.logger.error(
        `Falhou o evento ${event.type}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  subscribe(accountId: string, listener: RealtimeListener): () => void {
    const subscription = this.stream
      .pipe(filter((envelope) => envelope.accountId === accountId))
      .subscribe((envelope) => {
        try {
          listener(envelope.event);
        } catch (error) {
          this.logger.error("Falhou um ouvinte em tempo real", error as Error);
        }
      });
    return () => subscription.unsubscribe();
  }
}
