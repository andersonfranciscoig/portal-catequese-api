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
  CreateCelebrationUseCase,
  DeleteCelebrationUseCase,
  GetSacramentsOverviewUseCase,
  ListCelebrationParticipantsUseCase,
  ListClassMembersForSacramentUseCase,
  ListSacramentCandidatesUseCase,
  ListSelectableClassesUseCase,
  SetSacramentRequirementUseCase,
  UpdateCelebrationUseCase,
} from "../../application/use-cases/coordination/sacraments.use-cases.js";
import {
  CompleteCelebrationUseCase,
  ListSacramentRecordsUseCase,
  SacramentRecordsSummaryUseCase,
} from "../../application/use-cases/coordination/sacrament-records.use-cases.js";
import {
  SACRAMENT_TYPES,
  SacramentRequirement,
  type SacramentType,
} from "../../domain/sacraments.js";
import {
  candidateListSchema,
  classMembersSchema,
  completeCelebrationSchema,
  sacramentRecordsSchema,
  sacramentRecordsSummarySchema,
  type CompleteCelebrationBody,
  type SacramentRecordsQuery,
  type SacramentRecordsSummaryQuery,
  createCelebrationSchema,
  requirementSchema,
  sacramentRequirementParam,
  sacramentTypeParam,
  updateCelebrationSchema,
  type CandidateListQuery,
  type ClassMembersQuery,
  type CreateCelebrationBody,
  type RequirementBody,
  type UpdateCelebrationBody,
} from "./catechesis.schemas.js";
import { listedCenter, scopeOf } from "./http-center.js";

/** Coordenação: celebrações do ano (várias por sacramento), participantes e requisitos. */
@ApiTags("Coordenação — sacramentos")
@ApiBearerAuth()
@Controller("coordination/sacraments")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION)
export class CoordinationSacramentsController {
  constructor(
    private readonly overview: GetSacramentsOverviewUseCase,
    private readonly candidates: ListSacramentCandidatesUseCase,
    private readonly setRequirement: SetSacramentRequirementUseCase,
    private readonly createCelebration: CreateCelebrationUseCase,
    private readonly updateCelebration: UpdateCelebrationUseCase,
    private readonly deleteCelebration: DeleteCelebrationUseCase,
    private readonly participants: ListCelebrationParticipantsUseCase,
    private readonly selectableClasses: ListSelectableClassesUseCase,
    private readonly classMembers: ListClassMembersForSacramentUseCase,
    private readonly completeCelebration: CompleteCelebrationUseCase,
    private readonly records: ListSacramentRecordsUseCase,
    private readonly recordsSummary: SacramentRecordsSummaryUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Celebrações do ano e, por sacramento, candidatos e quem tem celebração",
  })
  getOverview(@CurrentAccount() actor: AccessTokenClaims, @Query("centerId") centerId?: string) {
    return this.overview.execute({ centerId: listedCenter(scopeOf(actor), centerId) });
  }

  // Antes de `:type/...` (senão "records" seria lido como sacramento).
  @Get("records")
  @ApiOperation({ summary: "Sacramentos realizados (filtros, pesquisa, páginas até 1000)" })
  @ApiZodQuery(sacramentRecordsSchema)
  listRecords(
    @CurrentAccount() actor: AccessTokenClaims,
    @Query(new ZodValidationPipe(sacramentRecordsSchema)) query: SacramentRecordsQuery,
  ) {
    return this.records.execute({
      ...query,
      centerId: listedCenter(scopeOf(actor), query.centerId),
    });
  }

  @Get("records/summary")
  @ApiOperation({ summary: "Totais de sacramentos realizados por tipo (no intervalo de datas)" })
  @ApiZodQuery(sacramentRecordsSummarySchema)
  summary(
    @Query(new ZodValidationPipe(sacramentRecordsSummarySchema))
    query: SacramentRecordsSummaryQuery,
  ) {
    return this.recordsSummary.execute(query);
  }

  @Post("celebrations/:id/complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Conclui a celebração: quem recebeu de facto (repetir corrige a lista)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(completeCelebrationSchema)
  complete(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeCelebrationSchema)) body: CompleteCelebrationBody,
  ) {
    return this.completeCelebration.execute({
      actorId: actor.accountId,
      id,
      catechumenIds: body.catechumenIds,
    });
  }

  @Post("celebrations")
  @ApiOperation({
    summary: "Marca uma celebração (seleção vazia: participantes sugeridos pelo sistema)",
  })
  @ApiZodBody(createCelebrationSchema)
  create(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(createCelebrationSchema)) body: CreateCelebrationBody,
  ) {
    return this.createCelebration.execute({ ...body, actorId: actor.accountId, scope: scopeOf(actor) });
  }

  @Put("celebrations/:id")
  @ApiOperation({ summary: "Altera uma celebração (o sacramento não muda)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(updateCelebrationSchema)
  update(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCelebrationSchema)) body: UpdateCelebrationBody,
  ) {
    return this.updateCelebration.execute({
      ...body,
      id,
      actorId: actor.accountId,
      scope: scopeOf(actor),
    });
  }

  @Delete("celebrations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Apaga uma celebração" })
  @ApiParam({ name: "id", format: "uuid" })
  async remove(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    await this.deleteCelebration.execute({ actorId: actor.accountId, id, scope: scopeOf(actor) });
  }

  @Get("celebrations/:id/participants")
  @ApiOperation({ summary: "Participantes de uma celebração (pesquisa e filtro)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodQuery(candidateListSchema)
  listParticipants(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(candidateListSchema)) query: CandidateListQuery,
  ) {
    return this.participants.execute({ id, ...query, scope: scopeOf(actor) });
  }

  @Get("classes/:classId/members")
  @ApiOperation({ summary: "Catequizandos de uma turma avaliados para um sacramento" })
  @ApiParam({ name: "classId", format: "uuid" })
  @ApiZodQuery(classMembersSchema)
  members(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("classId", ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(classMembersSchema)) query: ClassMembersQuery,
  ) {
    return this.classMembers.execute({ classId, type: query.type, scope: scopeOf(actor) });
  }

  @Get(":type/classes")
  @ApiOperation({ summary: "Turmas do ano para escolher (as do nível candidato primeiro)" })
  @ApiParam({ name: "type", enum: SACRAMENT_TYPES })
  classes(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("type", new ZodValidationPipe(sacramentTypeParam)) type: SacramentType,
    @Query("centerId") centerId?: string,
  ) {
    return this.selectableClasses.execute({
      type,
      centerId: listedCenter(scopeOf(actor), centerId),
    });
  }

  @Get(":type/candidates")
  @ApiOperation({ summary: "Candidatos de um sacramento e o estado dos requisitos" })
  @ApiParam({ name: "type", enum: SACRAMENT_TYPES })
  @ApiZodQuery(candidateListSchema)
  listCandidates(
    @Param("type", new ZodValidationPipe(sacramentTypeParam)) type: SacramentType,
    @Query(new ZodValidationPipe(candidateListSchema)) query: CandidateListQuery,
  ) {
    return this.candidates.execute({ type, ...query });
  }

  @Put(":type/candidates/:catechumenId/requirements/:requirement")
  @ApiOperation({ summary: "Marca (ou desmarca) um requisito entregue pela família" })
  @ApiParam({ name: "type", enum: SACRAMENT_TYPES })
  @ApiParam({ name: "requirement", enum: Object.values(SacramentRequirement) })
  @ApiZodBody(requirementSchema)
  requirement(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("type", new ZodValidationPipe(sacramentTypeParam)) type: SacramentType,
    @Param("catechumenId", ParseUUIDPipe) catechumenId: string,
    @Param("requirement", new ZodValidationPipe(sacramentRequirementParam))
    requirement: SacramentRequirement,
    @Body(new ZodValidationPipe(requirementSchema)) body: RequirementBody,
  ) {
    return this.setRequirement.execute({
      actorId: actor.accountId,
      type,
      catechumenId,
      requirement,
      met: body.met,
    });
  }
}
