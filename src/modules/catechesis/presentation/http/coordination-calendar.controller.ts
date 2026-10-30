import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
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
  DeleteCalendarActivityUseCase,
  ListCalendarActivitiesUseCase,
  SaveCalendarActivityUseCase,
} from "../../application/use-cases/coordination/calendar-activities.use-cases.js";
import { scopeOf } from "./http-center.js";
import { calendarActivitySchema, type CalendarActivityBody } from "./catechesis.schemas.js";

/** Coordenação: atividades do calendário, além das datas dos sacramentos. */
@ApiTags("Coordenação — calendário")
@ApiBearerAuth()
@Controller("coordination/calendar/activities")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION)
export class CoordinationCalendarActivitiesController {
  constructor(
    private readonly listActivities: ListCalendarActivitiesUseCase,
    private readonly save: SaveCalendarActivityUseCase,
    private readonly remove: DeleteCalendarActivityUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Atividades do calendário (os sacramentos vêm do módulo próprio)" })
  list() {
    return this.listActivities.execute();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Agenda uma atividade para todos, encarregados ou catequistas" })
  @ApiZodBody(calendarActivitySchema)
  create(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(calendarActivitySchema)) body: CalendarActivityBody,
  ) {
    return this.save.execute({ actorId: actor.accountId, ...body, scope: scopeOf(actor) });
  }

  @Put(":id")
  @ApiOperation({ summary: "Altera uma atividade" })
  @ApiZodBody(calendarActivitySchema)
  update(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(calendarActivitySchema)) body: CalendarActivityBody,
  ) {
    return this.save.execute({ actorId: actor.accountId, id, ...body, scope: scopeOf(actor) });
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retira uma atividade do calendário" })
  removeOne(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.remove.execute({ actorId: actor.accountId, id, scope: scopeOf(actor) });
  }
}
