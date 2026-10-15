import {
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

import { ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import {
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from "../../application/use-cases/my-notifications.use-cases.js";

const listSchema = z.object({
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.iso.datetime().optional(),
});

/** O sino de cada conta. */
@ApiTags("Notificações")
@ApiBearerAuth()
@Controller("me/notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly list: ListMyNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Notificações mais recentes e quantas estão por ler" })
  @ApiZodQuery(listSchema)
  index(
    @CurrentAccount() account: AccessTokenClaims,
    @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>,
  ) {
    return this.list.execute({
      accountId: account.accountId,
      unreadOnly: query.unread,
      limit: query.limit,
      before: query.before,
    });
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Marca todas como lidas" })
  readAll(@CurrentAccount() account: AccessTokenClaims) {
    return this.markAllRead.execute({ accountId: account.accountId });
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Marca uma notificação como lida" })
  @ApiParam({ name: "id", format: "uuid" })
  read(@CurrentAccount() account: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.markRead.execute({ accountId: account.accountId, notificationId: id });
  }
}
