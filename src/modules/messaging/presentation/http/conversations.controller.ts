import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { ApiZodBody, ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import { ListContactsUseCase } from "../../application/use-cases/contacts.use-case.js";
import {
  CountUnreadConversationsUseCase,
  ListConversationsUseCase,
  StartConversationUseCase,
} from "../../application/use-cases/conversations.use-cases.js";
import {
  ListMessagesUseCase,
  MarkConversationReadUseCase,
  MAX_PAGE_SIZE,
  SendMessageUseCase,
} from "../../application/use-cases/messages.use-cases.js";
import { MESSAGE_MAX_LENGTH } from "../../domain/message.js";

const contactsSchema = z.object({ search: z.string().max(100).optional() });

const startSchema = z.object({
  recipient: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("coordination") }),
    z.object({ kind: z.literal("account"), accountId: z.uuid() }),
  ]),
});

const messagesSchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

const sendSchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

/** Mensagens entre contas e com a equipa da coordenação. */
@ApiTags("Mensagens")
@ApiBearerAuth()
@Controller("me/conversations")
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(
    private readonly contacts: ListContactsUseCase,
    private readonly list: ListConversationsUseCase,
    private readonly unread: CountUnreadConversationsUseCase,
    private readonly start: StartConversationUseCase,
    private readonly messages: ListMessagesUseCase,
    private readonly send: SendMessageUseCase,
    private readonly read: MarkConversationReadUseCase,
  ) {}

  @Get("contacts")
  @ApiOperation({ summary: "Com quem pode iniciar uma conversa" })
  @ApiZodQuery(contactsSchema)
  contactList(
    @CurrentAccount() account: AccessTokenClaims,
    @Query(new ZodValidationPipe(contactsSchema)) query: z.infer<typeof contactsSchema>,
  ) {
    return this.contacts.execute({ accountId: account.accountId, search: query.search });
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Quantas conversas têm mensagens por ler" })
  unreadCount(@CurrentAccount() account: AccessTokenClaims) {
    return this.unread.execute({ accountId: account.accountId });
  }

  @Get()
  @ApiOperation({ summary: "Conversas, mais recentes primeiro" })
  index(@CurrentAccount() account: AccessTokenClaims) {
    return this.list.execute({ accountId: account.accountId });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Abre uma conversa (ou devolve a que já existe)" })
  @ApiZodBody(startSchema)
  open(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(startSchema)) body: z.infer<typeof startSchema>,
  ) {
    return this.start.execute({ accountId: account.accountId, recipient: body.recipient });
  }

  @Get(":id/messages")
  @ApiOperation({ summary: "Mensagens da conversa (da mais antiga para a mais recente)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodQuery(messagesSchema)
  messageList(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messagesSchema)) query: z.infer<typeof messagesSchema>,
  ) {
    return this.messages.execute({
      accountId: account.accountId,
      conversationId: id,
      before: query.before,
      limit: query.limit,
    });
  }

  @Post(":id/messages")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Envia uma mensagem" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(sendSchema)
  sendMessage(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendSchema)) body: z.infer<typeof sendSchema>,
  ) {
    return this.send.execute({ accountId: account.accountId, conversationId: id, body: body.body });
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Marca a conversa como lida" })
  @ApiParam({ name: "id", format: "uuid" })
  async markRead(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.read.execute({ accountId: account.accountId, conversationId: id });
  }
}
