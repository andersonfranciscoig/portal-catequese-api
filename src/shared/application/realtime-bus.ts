/** Evento enviado em tempo real a uma conta (ex.: pelo stream SSE `me/stream`). */
export interface RealtimeEvent {
  /** Nome estável do evento (ex.: "message.created"). */
  type: string;
  /** Conteúdo serializável em JSON. */
  data: unknown;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

/**
 * Entrega de eventos em tempo real às sessões abertas de cada conta. Hoje em
 * processo (uma só instância da API); com várias instâncias passa a ser um
 * pub/sub (ex.: Redis) sem mudar quem publica nem quem escuta.
 */
export abstract class RealtimeBus {
  /** Nunca falha: sem ninguém a escutar, o evento perde-se. */
  abstract publish(accountId: string, event: RealtimeEvent): void;
  /** Escuta os eventos da conta; devolve a função que cancela. */
  abstract subscribe(accountId: string, listener: RealtimeListener): () => void;
}
