import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import type { AccessTokenClaims } from "../../application/ports/access-token-issuer.js";
import { DecideCatechistUseCase } from "../../application/use-cases/admin/decide-catechist.use-case.js";
import { ListCatechistApplicationsUseCase } from "../../application/use-cases/admin/list-catechist-applications.use-case.js";
import { Permission } from "../../domain/account-role.js";
import { CurrentAccount } from "./decorators/current-account.decorator.js";
import { RequirePermissions } from "./decorators/require-permissions.decorator.js";
import { catechistDecisionSchema, type CatechistDecisionBody } from "./dtos/auth.schemas.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { PermissionsGuard } from "./guards/permissions.guard.js";

/** Candidaturas de catequistas, para a coordenação com "aprovar catequistas". */
@ApiTags("Coordenação — catequistas")
@ApiBearerAuth()
@Controller("coordination/catechist-applications")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION, Permission.APPROVE_CATECHISTS)
export class CoordinationCatechistsController {
  constructor(
    private readonly listApplications: ListCatechistApplicationsUseCase,
    private readonly decideCatechist: DecideCatechistUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Contas de catequista por aprovar" })
  list(@CurrentAccount() actor: AccessTokenClaims) {
    return this.listApplications.execute({ actorId: actor.accountId });
  }

  @Post(":id/decision")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aprova ou recusa uma conta de catequista" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(catechistDecisionSchema)
  decide(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(catechistDecisionSchema)) body: CatechistDecisionBody,
  ) {
    return this.decideCatechist.execute({ ...body, actorId: actor.accountId, accountId: id });
  }
}
