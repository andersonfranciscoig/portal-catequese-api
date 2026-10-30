import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { AppConfig } from "../../../../config/app-config.js";
import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import {
  RemovePushSubscriptionUseCase,
  SavePushSubscriptionUseCase,
} from "../../application/use-cases/push-subscriptions.use-cases.js";

const endpoint = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => value.startsWith("https://"), "O endereço tem de ser https.");

const subscribeSchema = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().trim().min(1).max(200),
    auth: z.string().trim().min(1).max(100),
  }),
  userAgent: z.string().trim().max(300).optional(),
});

const unsubscribeSchema = z.object({ endpoint });

/** Chave pública do Web Push (o navegador precisa dela para se subscrever). */
@ApiTags("Notificações")
@Controller("push")
export class PushPublicController {
  constructor(private readonly config: AppConfig) {}

  @Get("vapid-public-key")
  @ApiOperation({ summary: "Chave pública VAPID (503 quando o push está desligado)" })
  publicKey() {
    if (!this.config.webPush) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "notifications.push_disabled",
        message: "As notificações push não estão disponíveis.",
      });
    }
    return { publicKey: this.config.webPush.publicKey };
  }
}

/** Navegadores de cada conta que recebem notificações push. */
@ApiTags("Notificações")
@ApiBearerAuth()
@Controller("me/push-subscriptions")
@UseGuards(AuthGuard)
export class PushSubscriptionsController {
  constructor(
    private readonly save: SavePushSubscriptionUseCase,
    private readonly remove: RemovePushSubscriptionUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Liga este navegador às notificações push da conta" })
  @ApiZodBody(subscribeSchema)
  async subscribe(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(subscribeSchema)) body: z.infer<typeof subscribeSchema>,
  ) {
    await this.save.execute({ accountId: account.accountId, ...body });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Desliga este navegador das notificações push" })
  @ApiZodBody(unsubscribeSchema)
  async unsubscribe(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: z.infer<typeof unsubscribeSchema>,
  ) {
    await this.remove.execute({ accountId: account.accountId, endpoint: body.endpoint });
  }
}
