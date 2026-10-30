/**
 * Conteúdo de uma notificação push do navegador. O service worker do portal
 * depende exatamente desta forma.
 */
export interface PushPayload {
  kind: "message" | "notification";
  title: string;
  body: string;
  /** Caminho no portal a abrir ao tocar (ex.: "/mensagens?c=…"). */
  url: string;
  /** Agrupa notificações do mesmo assunto (ex.: "conv-…"). */
  tag: string;
}

/**
 * Envio de notificações push (Web Push) para os dispositivos das contas.
 * Implementado pelo módulo `notifications`. Nunca falha: sem chaves VAPID ou
 * com um serviço de push em baixo, o envio simplesmente não acontece.
 */
export abstract class PushNotifier {
  abstract send(accountIds: string[], payload: PushPayload): Promise<void>;
}
