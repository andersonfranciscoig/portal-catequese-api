import { Logger } from "@nestjs/common";
import webpush from "web-push";

import { PushNotifier, type PushPayload } from "../../../shared/application/push-notifier.js";
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from "../domain/push-subscription.js";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Envia uma notificação a um navegador; rejeita com `statusCode` quando o serviço recusa. */
export type PushTransport = (
  subscription: PushSubscriptionRecord,
  payload: string,
  vapid: VapidKeys,
) => Promise<unknown>;

const webPushTransport: PushTransport = (subscription, payload, vapid) =>
  webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    payload,
    {
      vapidDetails: vapid,
      // Um dia: depois disso a notificação já não interessa.
      TTL: 24 * 60 * 60,
      urgency: "high",
      timeout: 10_000,
    },
  );

/** Subscrição que o serviço de push deu como inexistente ou expirada. */
const GONE = new Set([404, 410]);

/**
 * Web Push (VAPID). Sem chaves configuradas fica desligado (avisa uma vez).
 * Nunca falha: erros são registados e as subscrições expiradas são apagadas.
 */
export class WebPushNotifier extends PushNotifier {
  private readonly logger = new Logger("WebPush");

  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly vapid: VapidKeys | null,
    private readonly transport: PushTransport = webPushTransport,
  ) {
    super();
    if (!vapid) {
      this.logger.warn(
        "Notificações push desligadas: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys).",
      );
    }
  }

  get enabled(): boolean {
    return Boolean(this.vapid);
  }

  async send(accountIds: string[], payload: PushPayload): Promise<void> {
    if (!this.vapid || !accountIds.length) return;
    const vapid = this.vapid;
    try {
      const targets = await this.subscriptions.listForAccounts(accountIds);
      if (!targets.length) return;
      const body = JSON.stringify(payload);
      const gone: string[] = [];
      await Promise.all(
        targets.map(async (subscription) => {
          try {
            await this.transport(subscription, body, vapid);
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status && GONE.has(status)) {
              gone.push(subscription.endpoint);
            } else {
              this.logger.warn(
                `Falhou o push (${status ?? "sem resposta"}): ${(error as Error).message}`,
              );
            }
          }
        }),
      );
      if (gone.length) await this.subscriptions.deleteByEndpoints(gone);
    } catch (error) {
      this.logger.error("Falhou o envio push", error instanceof Error ? error.stack : error);
    }
  }
}
