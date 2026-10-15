import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from "@nestjs/common";
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
  GetSacramentsOverviewUseCase,
  ListSacramentCandidatesUseCase,
  SetCelebrationUseCase,
  SetSacramentRequirementUseCase,
} from "../../application/use-cases/coordination/sacraments.use-cases.js";
import {
  SACRAMENT_TYPES,
  SacramentRequirement,
  type SacramentType,
} from "../../domain/sacraments.js";
import {
  candidateListSchema,
  celebrationSchema,
  requirementSchema,
  sacramentRequirementParam,
  sacramentTypeParam,
  type CandidateListQuery,
  type CelebrationBody,
  type RequirementBody,
} from "./catechesis.schemas.js";

/** Coordenação: celebrações do ano, candidatos e requisitos. */
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
    private readonly setCelebration: SetCelebrationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Celebrações do ano, com candidatos e quantos estão prontos" })
  getOverview() {
    return this.overview.execute();
  }

  @Put(":type/celebration")
  @ApiOperation({ summary: "Data e local da celebração no ano; `null` volta aos por omissão" })
  @ApiParam({ name: "type", enum: SACRAMENT_TYPES })
  @ApiZodBody(celebrationSchema)
  celebration(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("type", new ZodValidationPipe(sacramentTypeParam)) type: SacramentType,
    @Body(new ZodValidationPipe(celebrationSchema)) body: CelebrationBody,
  ) {
    return this.setCelebration.execute({
      actorId: actor.accountId,
      type,
      celebration: body.celebration,
    });
  }

  @Get(":type/candidates")
  @ApiOperation({ summary: "Candidatos de uma celebração e o estado dos requisitos" })
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
