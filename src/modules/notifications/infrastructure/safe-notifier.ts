import { Injectable, Logger } from "@nestjs/common";

import { Mailer } from "../../../shared/application/mailer.js";
import { Notifier, type NotificationMessage } from "../../../shared/application/notifier.js";
import { PeopleDirectory } from "../../../shared/application/people-directory.js";
import { DeliverNotificationUseCase } from "../application/use-cases/deliver-notification.use-case.js";

/**
 * Implementação da porta `Notifier`: entrega no sino e, se a pessoa tiver
 * email (e a mensagem não o dispensar), envia também por email. Uma falha
 * nunca anula a ação.
 */
@Injectable()
export class SafeNotifier extends Notifier {
  private readonly logger = new Logger("Notifications");

  constructor(
    private readonly deliver: DeliverNotificationUseCase,
    private readonly people: PeopleDirectory,
    private readonly mailer: Mailer,
  ) {
    super();
  }

  async notify(message: NotificationMessage): Promise<void> {
    try {
      await this.deliver.execute(message);
    } catch (error) {
      this.logger.error(
        `Falhou a notificação ${message.kind}`,
        error instanceof Error ? error.stack : error,
      );
    }

    if (message.email === false) return;
    try {
      await this.emailRecipients(message);
    } catch (error) {
      this.logger.error(
        `Falhou o email da notificação ${message.kind}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async emailRecipients(message: NotificationMessage) {
    const ids =
      "permission" in message.to
        ? await this.people.idsWithPermission(message.to.permission)
        : message.to.accountIds;
    const recipients = [...new Set(ids)].filter((id) => id && id !== message.exceptAccountId);
    if (!recipients.length) return;
    const people = await this.people.findMany(recipients);
    for (const person of people) {
      if (!person.email) continue;
      this.mailer.sendNotification({
        email: person.email,
        firstName: person.fullName.split(/\s+/)[0] ?? person.fullName,
        title: message.title,
        body: message.body,
        link: message.link,
      });
    }
  }
}
