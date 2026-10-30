import type { ContactDirectory } from "../../../shared/application/contact-directory.js";
import { isStaff, staffCenterFilter, type ChatPerson } from "../domain/chat-policy.js";
import type { Conversation } from "../domain/conversation.js";
import { ConversationNotAllowedError, ConversationNotFoundError } from "../domain/errors.js";
import type { ConversationRepository } from "../domain/repositories/messaging.repositories.js";
import type { People } from "./views.js";

/** Quem está a usar as mensagens e a que conversas tem acesso. */
export class ChatAccess {
  constructor(
    private readonly directory: ContactDirectory,
    private readonly conversations: ConversationRepository,
  ) {}

  /** A conta (ativa) de quem pede. */
  async viewer(accountId: string): Promise<ChatPerson> {
    const [person] = await this.directory.findMany([accountId]);
    if (!person?.active) throw new ConversationNotAllowedError();
    return person;
  }

  /** A conversa, se quem pede a pode ver (senão, como se não existisse). */
  async conversation(viewer: ChatPerson, conversationId: string): Promise<Conversation> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation?.canBeSeenBy(viewer.id, isStaff(viewer), staffCenterFilter(viewer))) {
      throw new ConversationNotFoundError();
    }
    return conversation;
  }

  async people(ids: string[]): Promise<People> {
    const found = await this.directory.findMany([...new Set(ids)]);
    return new Map(found.map((person) => [person.id, person]));
  }

  staffIds(): Promise<string[]> {
    return this.directory.staffIds();
  }
}
