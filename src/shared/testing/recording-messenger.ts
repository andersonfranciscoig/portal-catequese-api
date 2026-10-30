import {
  CoordinationMessenger,
  type CoordinationMessage,
} from "../application/coordination-messenger.js";

/** Guarda as mensagens para a coordenação enviadas, para os testes verificarem. */
export class RecordingMessenger extends CoordinationMessenger {
  readonly messages: CoordinationMessage[] = [];
  /** Para simular uma falha do chat. */
  failing = false;

  async post(message: CoordinationMessage) {
    if (this.failing) throw new Error("chat indisponível");
    this.messages.push(message);
    return { conversationId: `conv-${message.toAccountId}` };
  }
}
