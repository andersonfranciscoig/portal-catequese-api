import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import {
  GetClassCatechumenUseCase,
  GetEvaluationsUseCase,
  SaveEvaluationsUseCase,
} from "../../application/use-cases/catechist/evaluation.use-cases.js";
import { GetMyClassUseCase } from "../../application/use-cases/catechist/get-my-class.use-case.js";
import {
  GetRollUseCase,
  SaveRollUseCase,
} from "../../application/use-cases/catechist/roll.use-cases.js";
import {
  evaluationsSchema,
  rollSchema,
  sessionDateSchema,
  type EvaluationsBody,
  type RollBody,
} from "./catechesis.schemas.js";

/** Portal do catequista (aprovado): a sua turma do ano, presenças e avaliação. */
@ApiTags("Portal — catequista")
@ApiBearerAuth()
@Controller("me/catechist/class")
@UseGuards(AuthGuard)
export class CatechistController {
  constructor(
    private readonly myClass: GetMyClassUseCase,
    private readonly getRoll: GetRollUseCase,
    private readonly saveRoll: SaveRollUseCase,
    private readonly getEvaluations: GetEvaluationsUseCase,
    private readonly saveEvaluations: SaveEvaluationsUseCase,
    private readonly catechumen: GetClassCatechumenUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "A turma, os catequizandos e os encontros já realizados" })
  get(@CurrentAccount() account: AccessTokenClaims) {
    return this.myClass.execute({ accountId: account.accountId });
  }

  @Get("attendance/:date")
  @ApiOperation({ summary: "Chamada de um encontro" })
  @ApiParam({ name: "date", example: "2026-10-10" })
  roll(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("date", new ZodValidationPipe(sessionDateSchema)) date: string,
  ) {
    return this.getRoll.execute({ accountId: account.accountId, date });
  }

  @Put("attendance/:date")
  @ApiOperation({ summary: "Lança ou corrige a chamada de um encontro" })
  @ApiParam({ name: "date", example: "2026-10-10" })
  @ApiZodBody(rollSchema)
  saveAttendance(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("date", new ZodValidationPipe(sessionDateSchema)) date: string,
    @Body(new ZodValidationPipe(rollSchema)) body: RollBody,
  ) {
    return this.saveRoll.execute({ accountId: account.accountId, date, marks: body.marks });
  }

  @Get("evaluations")
  @ApiOperation({ summary: "Pauta da turma" })
  evaluations(@CurrentAccount() account: AccessTokenClaims) {
    return this.getEvaluations.execute({ accountId: account.accountId });
  }

  @Put("evaluations")
  @ApiOperation({ summary: "Guarda notas e decisões" })
  @ApiZodBody(evaluationsSchema)
  updateEvaluations(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(evaluationsSchema)) body: EvaluationsBody,
  ) {
    return this.saveEvaluations.execute({ accountId: account.accountId, rows: body.rows });
  }

  @Get("catechumens/:id")
  @ApiOperation({ summary: "Ficha de um catequizando da turma" })
  @ApiParam({ name: "id", format: "uuid" })
  file(@CurrentAccount() account: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.catechumen.execute({ accountId: account.accountId, catechumenId: id });
  }
}
