export interface CoordinationMessage {
  /** A conta que recebe (a conversa é a dela com a coordenação). */
  toAccountId: string;
  body: string;
  /**
   * Conta da equipa que escreve (mensagem normal, em seu nome). Sem ela, a
   * mensagem é automática e aparece como "Portal da Catequese".
   */
  fromAccountId?: string;
}

/**
 * Mensagens na conversa de uma conta com a coordenação (a thread "Coordenação"
 * do chat), criada se ainda não existir. Contrato partilhado: o módulo
 * `messaging` implementa-o; quem o usa não depende desse módulo. Entrega em
 * tempo real e por push como qualquer outra mensagem.
 */
export abstract class CoordinationMessenger {
  /** Devolve a conversa onde ficou a mensagem. */
  abstract post(message: CoordinationMessage): Promise<{ conversationId: string }>;
}
