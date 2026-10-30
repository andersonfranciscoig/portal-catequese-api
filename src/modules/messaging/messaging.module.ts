import { Global, Module } from "@nestjs/common";

import { CatechesisRelations } from "../../shared/application/catechesis-relations.js";
import { ContactDirectory } from "../../shared/application/contact-directory.js";
import { CoordinationMessenger } from "../../shared/application/coordination-messenger.js";
import { PushNotifier } from "../../shared/application/push-notifier.js";
import { RealtimeBus } from "../../shared/application/realtime-bus.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { CatechesisModule } from "../catechesis/index.js";
import { IdentityModule } from "../identity/index.js";
import { ChatAccess } from "./application/chat-access.js";
import { ChatCoordinationMessenger } from "./application/chat-coordination-messenger.js";
import { ListContactsUseCase } from "./application/use-cases/contacts.use-case.js";
import {
  CountUnreadConversationsUseCase,
  ListConversationsUseCase,
  StartConversationUseCase,
} from "./application/use-cases/conversations.use-cases.js";
import {
  ListMessagesUseCase,
  MarkConversationReadUseCase,
  SendMessageUseCase,
} from "./application/use-cases/messages.use-cases.js";
import {
  ConversationRepository,
  MessageRepository,
} from "./domain/repositories/messaging.repositories.js";
import {
  PrismaConversationRepository,
  PrismaMessageRepository,
} from "./infrastructure/persistence/prisma-messaging.repositories.js";
import { ConversationsController } from "./presentation/http/conversations.controller.js";

const CONVERSATIONS = ConversationRepository;
const MESSAGES = MessageRepository;

/**
 * Módulo das mensagens: conversas diretas e com a equipa da coordenação.
 * Das contas só conhece `ContactDirectory` (identidade) e das turmas
 * `CatechesisRelations` (catequese); entrega em tempo real pelo `RealtimeBus`
 * e por push pelo `PushNotifier` (notificações). Global porque implementa a
 * porta partilhada `CoordinationMessenger` (mensagens da coordenação e do
 * portal), usada pela catequese.
 */
@Global()
@Module({
  imports: [IdentityModule, CatechesisModule],
  controllers: [ConversationsController],
  providers: [
    { provide: CONVERSATIONS, useClass: PrismaConversationRepository },
    { provide: MESSAGES, useClass: PrismaMessageRepository },
    provideUseCase(ChatAccess, [ContactDirectory, CONVERSATIONS]),
    provideUseCase(ListContactsUseCase, [ChatAccess, ContactDirectory, CatechesisRelations, Clock]),
    provideUseCase(ListConversationsUseCase, [ChatAccess, CONVERSATIONS]),
    provideUseCase(CountUnreadConversationsUseCase, [ChatAccess, CONVERSATIONS]),
    provideUseCase(StartConversationUseCase, [
      ChatAccess,
      ContactDirectory,
      CatechesisRelations,
      CONVERSATIONS,
      Clock,
    ]),
    provideUseCase(ListMessagesUseCase, [ChatAccess, MESSAGES]),
    provideUseCase(SendMessageUseCase, [
      ChatAccess,
      CONVERSATIONS,
      MESSAGES,
      RealtimeBus,
      PushNotifier,
      Clock,
    ]),
    provideUseCase(MarkConversationReadUseCase, [ChatAccess, CONVERSATIONS, RealtimeBus, Clock]),
    {
      provide: CoordinationMessenger,
      inject: [ChatAccess, CONVERSATIONS, MESSAGES, RealtimeBus, PushNotifier, Clock],
      useFactory: (...deps: ConstructorParameters<typeof ChatCoordinationMessenger>) =>
        new ChatCoordinationMessenger(...deps),
    },
  ],
  exports: [CoordinationMessenger],
})
export class MessagingModule {}
