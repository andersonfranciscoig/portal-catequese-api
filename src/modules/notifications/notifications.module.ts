import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../../config/app-config.js";
import { Notifier } from "../../shared/application/notifier.js";
import { PeopleDirectory } from "../../shared/application/people-directory.js";
import { PushNotifier } from "../../shared/application/push-notifier.js";
import { RealtimeBus } from "../../shared/application/realtime-bus.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { IdentityModule } from "../identity/index.js";
import { DeliverNotificationUseCase } from "./application/use-cases/deliver-notification.use-case.js";
import {
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from "./application/use-cases/my-notifications.use-cases.js";
import {
  RemovePushSubscriptionUseCase,
  SavePushSubscriptionUseCase,
} from "./application/use-cases/push-subscriptions.use-cases.js";
import { PushSubscriptionRepository } from "./domain/push-subscription.js";
import { NotificationRepository } from "./domain/repositories/notification.repository.js";
import { PrismaNotificationRepository } from "./infrastructure/persistence/prisma-notification.repository.js";
import { PrismaPushSubscriptionRepository } from "./infrastructure/persistence/push-subscription.repositories.js";
import { SafeNotifier } from "./infrastructure/safe-notifier.js";
import { WebPushNotifier } from "./infrastructure/web-push-notifier.js";
import { NotificationsController } from "./presentation/http/notifications.controller.js";
import {
  PushPublicController,
  PushSubscriptionsController,
} from "./presentation/http/push.controller.js";
import { StreamController } from "./presentation/http/stream.controller.js";

const NOTIFICATIONS = NotificationRepository;
const SUBSCRIPTIONS = PushSubscriptionRepository;

/**
 * Módulo das notificações: guarda e mostra os avisos de cada conta, o stream em
 * tempo real (`me/stream`) e as notificações push do navegador. Global porque
 * implementa as portas partilhadas `Notifier` e `PushNotifier`, usadas pelos
 * outros módulos.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [
    NotificationsController,
    PushPublicController,
    PushSubscriptionsController,
    StreamController,
  ],
  providers: [
    { provide: NOTIFICATIONS, useClass: PrismaNotificationRepository },
    { provide: SUBSCRIPTIONS, useClass: PrismaPushSubscriptionRepository },
    {
      provide: PushNotifier,
      inject: [SUBSCRIPTIONS, AppConfig],
      useFactory: (subscriptions: PushSubscriptionRepository, config: AppConfig) =>
        new WebPushNotifier(subscriptions, config.webPush),
    },
    provideUseCase(DeliverNotificationUseCase, [
      NOTIFICATIONS,
      PeopleDirectory,
      Clock,
      RealtimeBus,
      PushNotifier,
    ]),
    provideUseCase(ListMyNotificationsUseCase, [NOTIFICATIONS]),
    provideUseCase(MarkNotificationReadUseCase, [NOTIFICATIONS, Clock]),
    provideUseCase(MarkAllNotificationsReadUseCase, [NOTIFICATIONS, Clock]),
    provideUseCase(SavePushSubscriptionUseCase, [SUBSCRIPTIONS, Clock]),
    provideUseCase(RemovePushSubscriptionUseCase, [SUBSCRIPTIONS]),
    SafeNotifier,
    { provide: Notifier, useExisting: SafeNotifier },
  ],
  exports: [Notifier, PushNotifier],
})
export class NotificationsModule {}
