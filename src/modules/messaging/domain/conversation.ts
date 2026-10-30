import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { SEDE_CENTER_ID } from "../../../shared/domain/parish-centers.js";
import type { Message } from "./message.js";

/**
 * - DIRECT: entre duas contas (uma conversa por par)
 * - COORDINATION: entre uma conta e toda a equipa da coordenação (uma por conta)
 */
export type ConversationKind = "DIRECT" | "COORDINATION";

export interface LastMessage {
  body: string;
  sentAt: Date;
  /** `null` numa mensagem automática do portal. */
  senderId: string | null;
}

export interface ConversationProps {
  kind: ConversationKind;
  /** DIRECT: os dois ids ordenados, "a:b". */
  directKey?: string;
  /** COORDINATION: a conta que fala com a equipa. */
  subjectAccountId?: string;
  /** COORDINATION: o centro. Nulo nas conversas diretas. */
  centerId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: LastMessage;
}

export class Conversation extends AggregateRoot<ConversationProps> {
  static directKeyFor(a: string, b: string): string {
    return [a, b].sort().join(":");
  }

  static direct(a: string, b: string, now: Date): Conversation {
    return new Conversation({
      kind: "DIRECT",
      directKey: Conversation.directKeyFor(a, b),
      createdAt: now,
      updatedAt: now,
    });
  }

  static coordination(subjectAccountId: string, now: Date, centerId = SEDE_CENTER_ID): Conversation {
    return new Conversation({
      kind: "COORDINATION",
      subjectAccountId,
      centerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ConversationProps, id: UniqueId): Conversation {
    return new Conversation({ ...props }, id);
  }

  get kind() {
    return this.props.kind;
  }
  get directKey() {
    return this.props.directKey;
  }
  get subjectAccountId() {
    return this.props.subjectAccountId;
  }
  get centerId() {
    return this.props.centerId;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get lastMessage(): Readonly<LastMessage> | undefined {
    return this.props.lastMessage;
  }

  /** Participantes fixos: as duas contas (DIRECT) ou a conta (COORDINATION). */
  get memberIds(): string[] {
    return this.props.kind === "DIRECT"
      ? (this.props.directKey ?? "").split(":").filter(Boolean)
      : [this.props.subjectAccountId!];
  }

  /** Na conversa com a coordenação, toda a equipa (coordenação e administração) participa. */
  canBeSeenBy(accountId: string, isStaff: boolean, staffCenterId?: string): boolean {
    if (this.props.kind === "COORDINATION") {
      if (this.props.subjectAccountId === accountId) return true;
      if (!isStaff) return false;
      return !staffCenterId || (this.props.centerId ?? SEDE_CENTER_ID) === staffCenterId;
    }
    return this.memberIds.includes(accountId);
  }

  /** Quem vê a conversa (para entregar mensagens e leituras). */
  audience(staffIds: string[]): string[] {
    return this.props.kind === "COORDINATION"
      ? [...new Set([this.props.subjectAccountId!, ...staffIds])]
      : this.memberIds;
  }

  /**
   * Hora da próxima mensagem: nunca antes da última, para a ordem se manter
   * mesmo com duas mensagens no mesmo milissegundo.
   */
  nextMessageTime(now: Date): Date {
    const last = this.props.lastMessage?.sentAt;
    return last && now.getTime() <= last.getTime() ? new Date(last.getTime() + 1) : now;
  }

  recordMessage(message: Message) {
    this.props.lastMessage = {
      body: message.body,
      sentAt: message.createdAt,
      senderId: message.senderId,
    };
    this.props.updatedAt = message.createdAt;
  }
}
