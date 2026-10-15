import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

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
  GetSessionUseCase,
  ListSessionDaysUseCase,
  SetCatechistPresenceUseCase,
} from "../../application/use-cases/coordination/attendance.use-cases.js";
import { SetDeadlineUseCase } from "../../application/use-cases/coordination/calendar.use-cases.js";
import {
  GetCatechistProfileUseCase,
  ListCatechistsUseCase,
  SetCatechistStatusUseCase,
} from "../../application/use-cases/coordination/catechists.use-cases.js";
import {
  GetCatechumenFileUseCase,
  ListCatechumensUseCase,
} from "../../application/use-cases/coordination/catechumens.use-cases.js";
import {
  GetClassDetailUseCase,
  GetClassResultsUseCase,
  ListYearsUseCase,
} from "../../application/use-cases/coordination/class-detail.use-cases.js";
import {
  GenerateClassesUseCase,
  PlanClassesUseCase,
} from "../../application/use-cases/coordination/class-generation.use-cases.js";
import { GetOverviewUseCase } from "../../application/use-cases/coordination/overview.use-case.js";
import {
  catechistListSchema,
  catechistStatusSchema,
  catechumenListSchema,
  deadlineSchema,
  deadlinePurposeParam,
  generateClassesSchema,
  planClassesSchema,
  presenceSchema,
  sessionDateSchema,
  type CatechistListQuery,
  type CatechumenListQuery,
  type DeadlineBody,
  type GenerateClassesBody,
  type PlanClassesQuery,
} from "./catechesis.schemas.js";

/** Coordenação: resumo, turmas, catequistas, catequizandos, presenças e prazos. */
@ApiTags("Coordenação — gestão")
@ApiBearerAuth()
@Controller("coordination")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION)
export class CoordinationManagementController {
  constructor(
    private readonly overview: GetOverviewUseCase,
    private readonly setDeadline: SetDeadlineUseCase,
    private readonly years: ListYearsUseCase,
    private readonly classDetail: GetClassDetailUseCase,
    private readonly classResults: GetClassResultsUseCase,
    private readonly planClasses: PlanClassesUseCase,
    private readonly generateClasses: GenerateClassesUseCase,
    private readonly listCatechists: ListCatechistsUseCase,
    private readonly catechistProfile: GetCatechistProfileUseCase,
    private readonly setCatechistStatus: SetCatechistStatusUseCase,
    private readonly sessionDays: ListSessionDaysUseCase,
    private readonly session: GetSessionUseCase,
    private readonly setPresence: SetCatechistPresenceUseCase,
    private readonly listCatechumens: ListCatechumensUseCase,
    private readonly catechumenFile: GetCatechumenFileUseCase,
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "Resumo do ano: números, evolução, distribuição e o que pede atenção" })
  getOverview() {
    return this.overview.execute();
  }

  @Put("calendar/deadlines/:purpose")
  @ApiOperation({ summary: "Prazo das famílias (matrícula ou confirmação); `null` retira-o" })
  @ApiParam({ name: "purpose", enum: ["ENROLLMENT", "CONFIRMATION"] })
  @ApiZodBody(deadlineSchema)
  deadline(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("purpose", new ZodValidationPipe(deadlinePurposeParam))
    purpose: "ENROLLMENT" | "CONFIRMATION",
    @Body(new ZodValidationPipe(deadlineSchema)) body: DeadlineBody,
  ) {
    return this.setDeadline.execute({ actorId: actor.accountId, purpose, window: body.window });
  }

  /* Turmas */

  @Get("years")
  @ApiOperation({ summary: "Anos catequéticos com turmas" })
  listYears() {
    return this.years.execute();
  }

  @Get("classes/plan")
  @ApiOperation({ summary: "Quantas turmas são precisas num nível" })
  @ApiZodQuery(planClassesSchema)
  plan(@Query(new ZodValidationPipe(planClassesSchema)) query: PlanClassesQuery) {
    return this.planClasses.execute(query);
  }

  @Post("classes/generate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Gera as turmas que faltam, coloca os aprovados e atribui catequistas",
  })
  @ApiZodBody(generateClassesSchema)
  generate(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(generateClassesSchema)) body: GenerateClassesBody,
  ) {
    return this.generateClasses.execute({ ...body, actorId: actor.accountId });
  }

  @Get("classes/:id")
  @ApiOperation({ summary: "Turma: catequizandos e presenças por encontro" })
  @ApiParam({ name: "id", format: "uuid" })
  classById(@Param("id", ParseUUIDPipe) id: string) {
    return this.classDetail.execute({ classId: id });
  }

  @Get("classes/:id/results")
  @ApiOperation({ summary: "Pauta final da turma" })
  @ApiParam({ name: "id", format: "uuid" })
  results(@Param("id", ParseUUIDPipe) id: string) {
    return this.classResults.execute({ classId: id });
  }

  /* Catequistas */

  @Get("catechists")
  @ApiOperation({ summary: "Catequistas aprovados por estado" })
  @ApiZodQuery(catechistListSchema)
  catechists(@Query(new ZodValidationPipe(catechistListSchema)) query: CatechistListQuery) {
    return this.listCatechists.execute(query);
  }

  @Get("catechists/:id")
  @ApiOperation({ summary: "Perfil do catequista com as turmas de cada ano" })
  @ApiParam({ name: "id", format: "uuid" })
  catechist(@Param("id", ParseUUIDPipe) id: string) {
    return this.catechistProfile.execute({ accountId: id });
  }

  @Put("catechists/:id/status")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Em formação, indisponível ou inativo (`null` volta ao automático)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(catechistStatusSchema)
  async catechistStatus(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(catechistStatusSchema))
    body: { status: "IN_TRAINING" | "UNAVAILABLE" | "INACTIVE" | null },
  ) {
    await this.setCatechistStatus.execute({
      actorId: actor.accountId,
      accountId: id,
      status: body.status,
    });
  }

  /* Presenças */

  @Get("attendance")
  @ApiOperation({ summary: "Dias com encontros já realizados" })
  days() {
    return this.sessionDays.execute();
  }

  @Get("attendance/:date")
  @ApiOperation({ summary: "Turmas de um dia: chamada e presença do catequista" })
  @ApiParam({ name: "date", example: "2026-10-10" })
  sessionOf(@Param("date", new ZodValidationPipe(sessionDateSchema)) date: string) {
    return this.session.execute({ date });
  }

  @Put("attendance/:date/catechists/:classId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Presença do catequista nesse encontro" })
  @ApiZodBody(presenceSchema)
  async presence(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("date", new ZodValidationPipe(sessionDateSchema)) date: string,
    @Param("classId", ParseUUIDPipe) classId: string,
    @Body(new ZodValidationPipe(presenceSchema))
    body: { status: "PRESENT" | "ABSENT" | "JUSTIFIED" },
  ) {
    await this.setPresence.execute({
      actorId: actor.accountId,
      classId,
      date,
      status: body.status,
    });
  }

  /* Catequizandos */

  @Get("catechumens")
  @ApiOperation({ summary: "Catequizandos do ano (pesquisa, etapa, estado, páginas)" })
  @ApiZodQuery(catechumenListSchema)
  catechumens(@Query(new ZodValidationPipe(catechumenListSchema)) query: CatechumenListQuery) {
    return this.listCatechumens.execute(query);
  }

  @Get("catechumens/:id")
  @ApiOperation({ summary: "Ficha do catequizando: contactos e percurso de todos os anos" })
  @ApiParam({ name: "id", format: "uuid" })
  catechumen(@Param("id", ParseUUIDPipe) id: string) {
    return this.catechumenFile.execute({ catechumenId: id });
  }
}
