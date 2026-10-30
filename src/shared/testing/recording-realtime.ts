import { PushNotifier, type PushPayload } from "../application/push-notifier.js";
import { RealtimeBus, type RealtimeEvent } from "../application/realtime-bus.js";

/** Guarda os eventos em tempo real publicados para os testes verificarem. */
export class RecordingRealtimeBus extends RealtimeBus {
  readonly published: { accountId: string; event: RealtimeEvent }[] = [];

  publish(accountId: string, event: RealtimeEvent): void {
    this.published.push({ accountId, event });
  }

  subscribe(): () => void {
    return () => undefined;
  }

  to(accountId: string, type?: string): RealtimeEvent[] {
    return this.published
      .filter((item) => item.accountId === accountId && (!type || item.event.type === type))
      .map((item) => item.event);
  }
}

/** Guarda os envios push para os testes verificarem. */
export class RecordingPushNotifier extends PushNotifier {
  readonly sent: { accountIds: string[]; payload: PushPayload }[] = [];

  async send(accountIds: string[], payload: PushPayload): Promise<void> {
    if (accountIds.length) this.sent.push({ accountIds: [...accountIds], payload });
  }
}
