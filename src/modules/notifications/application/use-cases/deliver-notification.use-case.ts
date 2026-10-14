import type { NotificationMessage } from "../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { Notification } from "../../domain/notification.js";
import type { NotificationRepository } from "../../domain/repositories/notification.repository.js";

/**
 * Entrega uma notificação a cada destinatário: contas indicadas ou quem tem uma
 * permissão (resolvida no diretório de pessoas). Sem repetidos e sem quem fez a ação.
 */
export class DeliverNotificationUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({ to, exceptAccountId, ...message }: NotificationMessage): Promise<number> {
    const ids =
      "permission" in to ? await this.people.idsWithPermission(to.permission) : to.accountIds;
    const recipients = [...new Set(ids)].filter((id) => id && id !== exceptAccountId);
    if (!recipients.length) return 0;
    const createdAt = this.clock.now();
    await this.notifications.saveMany(
      recipients.map((recipientId) => Notification.create({ ...message, recipientId, createdAt })),
    );
    return recipients.length;
  }
}
