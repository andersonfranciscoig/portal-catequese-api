import type { NotificationMessage } from "../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../shared/application/people-directory.js";
import type { PushNotifier } from "../../../../shared/application/push-notifier.js";
import type { RealtimeBus } from "../../../../shared/application/realtime-bus.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { Notification } from "../../domain/notification.js";
import type { NotificationRepository } from "../../domain/repositories/notification.repository.js";
import { toNotificationView } from "../views.js";

/** Evento em tempo real de uma notificação nova (stream `me/stream`). */
export const NOTIFICATION_CREATED = "notification.created";

/**
 * Entrega uma notificação a cada destinatário: contas indicadas ou quem tem uma
 * permissão (resolvida no diretório de pessoas). Sem repetidos e sem quem fez a ação.
 * Depois de gravada, avisa em tempo real e por push (sem nunca falhar por isso).
 */
export class DeliverNotificationUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
    private readonly realtime?: RealtimeBus,
    private readonly push?: PushNotifier,
  ) {}

  async execute({ to, exceptAccountId, ...message }: NotificationMessage): Promise<number> {
    const ids =
      "permission" in to ? await this.people.idsWithPermission(to.permission) : to.accountIds;
    const recipients = [...new Set(ids)].filter((id) => id && id !== exceptAccountId);
    if (!recipients.length) return 0;
    const createdAt = this.clock.now();
    const created = recipients.map((recipientId) =>
      Notification.create({ ...message, recipientId, createdAt }),
    );
    await this.notifications.saveMany(created);
    this.announce(created);
    return recipients.length;
  }

  private announce(created: Notification[]) {
    for (const notification of created) {
      try {
        this.realtime?.publish(notification.recipientId, {
          type: NOTIFICATION_CREATED,
          data: { notification: toNotificationView(notification) },
        });
        // Sem esperar: o push é lento e nunca deve atrasar nem anular a ação.
        void this.push
          ?.send([notification.recipientId], {
            kind: "notification",
            title: notification.title,
            body: notification.body ?? "",
            url: notification.link ?? "/notificacoes",
            tag: `notif-${notification.id.value}`,
          })
          .catch(() => undefined);
      } catch {
        // O aviso em tempo real é um extra: a notificação já ficou gravada.
      }
    }
  }
}
