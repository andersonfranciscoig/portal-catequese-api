import { Notifier, type NotificationMessage } from "../application/notifier.js";

/** Guarda as notificações enviadas para os testes verificarem. */
export class RecordingNotifier extends Notifier {
  readonly messages: NotificationMessage[] = [];

  async notify(message: NotificationMessage): Promise<void> {
    this.messages.push(message);
  }

  kinds(): string[] {
    return this.messages.map((message) => message.kind);
  }

  last(kind: string): NotificationMessage | undefined {
    return this.messages.findLast((message) => message.kind === kind);
  }
}
