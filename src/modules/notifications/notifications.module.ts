import { Global, Module } from "@nestjs/common";

import { Notifier } from "../../shared/application/notifier.js";
import { PeopleDirectory } from "../../shared/application/people-directory.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { IdentityModule } from "../identity/index.js";
import { DeliverNotificationUseCase } from "./application/use-cases/deliver-notification.use-case.js";
import {
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from "./application/use-cases/my-notifications.use-cases.js";
import { NotificationRepository } from "./domain/repositories/notification.repository.js";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository.js";
import { SafeNotifier } from "./infrastructure/safe-notifier.js";
import { NotificationsController } from "./presentation/http/notifications.controller.js";

const NOTIFICATIONS = NotificationRepository;

/**
 * Módulo das notificações: guarda e mostra os avisos de cada conta. Global
 * porque implementa a porta partilhada `Notifier`, usada pelos outros módulos.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATIONS, useClass: PrismaNotificationRepository },
    provideUseCase(DeliverNotificationUseCase, [NOTIFICATIONS, PeopleDirectory, Clock]),
    provideUseCase(ListMyNotificationsUseCase, [NOTIFICATIONS]),
    provideUseCase(MarkNotificationReadUseCase, [NOTIFICATIONS, Clock]),
    provideUseCase(MarkAllNotificationsReadUseCase, [NOTIFICATIONS, Clock]),
    SafeNotifier,
    { provide: Notifier, useExisting: SafeNotifier },
  ],
  exports: [Notifier],
})
export class NotificationsModule {}
