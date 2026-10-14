import { Injectable, Logger } from "@nestjs/common";

import { Notifier, type NotificationMessage } from "../../../shared/application/notifier.js";
import { DeliverNotificationUseCase } from "../application/use-cases/deliver-notification.use-case.js";

/**
 * Implementação da porta `Notifier`: entrega e, se falhar, só regista o erro
 * (a matrícula, a aprovação… já aconteceram e não podem falhar por isto).
 */
@Injectable()
export class SafeNotifier extends Notifier {
  private readonly logger = new Logger("Notifications");

  constructor(private readonly deliver: DeliverNotificationUseCase) {
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
  }
}
