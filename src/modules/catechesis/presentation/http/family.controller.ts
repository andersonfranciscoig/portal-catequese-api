import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import { GetCatechumenProfileUseCase } from "../../application/use-cases/family/get-catechumen-profile.use-case.js";
import { GetFamilyUseCase } from "../../application/use-cases/family/get-family.use-case.js";
import { SubmitEnrollmentUseCase } from "../../application/use-cases/family/submit-enrollment.use-case.js";
import { submitEnrollmentSchema, type SubmitEnrollmentBody } from "./catechesis.schemas.js";

/** Portal da família: o encarregado (educandos) ou o adulto (o próprio). */
@ApiTags("Portal — família")
@ApiBearerAuth()
@Controller("me")
@UseGuards(AuthGuard)
export class FamilyController {
  constructor(
    private readonly family: GetFamilyUseCase,
    private readonly profile: GetCatechumenProfileUseCase,
    private readonly submitEnrollment: SubmitEnrollmentUseCase,
  ) {}

  @Get("family")
  @ApiOperation({ summary: "Educandos (ou o próprio) com a matrícula e a turma do ano" })
  getFamily(@CurrentAccount() account: AccessTokenClaims) {
    return this.family.execute({ accountId: account.accountId });
  }

  @Get("enrollments")
  @ApiOperation({ summary: "Todas as matrículas da família" })
  async enrollments(@CurrentAccount() account: AccessTokenClaims) {
    return (await this.family.execute({ accountId: account.accountId })).enrollments;
  }

  @Get("catechumens/:id")
  @ApiOperation({ summary: "Perfil de um educando (ou do próprio)" })
  @ApiParam({ name: "id", format: "uuid" })
  catechumen(@CurrentAccount() account: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.profile.execute({ accountId: account.accountId, catechumenId: id });
  }

  @Post("enrollments")
  @ApiOperation({ summary: "Submete uma matrícula (educando menor ou o próprio adulto)" })
  @ApiZodBody(submitEnrollmentSchema)
  enroll(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(submitEnrollmentSchema)) body: SubmitEnrollmentBody,
  ) {
    return this.submitEnrollment.execute({ ...body, accountId: account.accountId });
  }
}
