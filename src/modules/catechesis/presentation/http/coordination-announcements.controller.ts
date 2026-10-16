import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ApiZodBody, ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import {
  AuthGuard,
  CurrentAccount,
  Permission,
  PermissionsGuard,
  RequirePermissions,
  type AccessTokenClaims,
} from "../../../identity/index.js";
import {
  DeleteAnnouncementUseCase,
  ListAnnouncementsUseCase,
  PublishAnnouncementUseCase,
  SetAnnouncementPinnedUseCase,
} from "../../application/use-cases/coordination/announcements.use-cases.js";
import {
  announcementListSchema,
  pinAnnouncementSchema,
  publishAnnouncementSchema,
  type AnnouncementListQuery,
  type PinAnnouncementBody,
  type PublishAnnouncementBody,
} from "./catechesis.schemas.js";

/** Coordenação: avisos do portal (Comunicação) e o sino de quem os recebe. */
@ApiTags("Coordenação — comunicação")
@ApiBearerAuth()
@Controller("coordination/announcements")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION)
export class CoordinationAnnouncementsController {
  constructor(
    private readonly listAnnouncements: ListAnnouncementsUseCase,
    private readonly publish: PublishAnnouncementUseCase,
    private readonly pin: SetAnnouncementPinnedUseCase,
    private readonly remove: DeleteAnnouncementUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Avisos publicados, com destinatários e leituras" })
  @ApiZodQuery(announcementListSchema)
  list(@Query(new ZodValidationPipe(announcementListSchema)) query: AnnouncementListQuery) {
    return this.listAnnouncements.execute(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Publica um aviso e, se pedido, notifica no sino" })
  @ApiZodBody(publishAnnouncementSchema)
  create(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(publishAnnouncementSchema)) body: PublishAnnouncementBody,
  ) {
    return this.publish.execute({ actorId: actor.accountId, ...body });
  }

  @Patch(":id")
  @ApiOperation({ summary: "Fixa ou desafixa um aviso" })
  @ApiZodBody(pinAnnouncementSchema)
  setPinned(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pinAnnouncementSchema)) body: PinAnnouncementBody,
  ) {
    return this.pin.execute({ actorId: actor.accountId, id, pinned: body.pinned });
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Apaga um aviso" })
  removeOne(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.remove.execute({ actorId: actor.accountId, id });
  }
}
