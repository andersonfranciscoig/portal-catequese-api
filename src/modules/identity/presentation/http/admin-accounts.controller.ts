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
import type { AccessTokenClaims } from "../../application/ports/access-token-issuer.js";
import { BlockAccountUseCase } from "../../application/use-cases/admin/block-account.use-case.js";
import { DecideCatechistUseCase } from "../../application/use-cases/admin/decide-catechist.use-case.js";
import { GetAccountStatsUseCase } from "../../application/use-cases/admin/get-account-stats.use-case.js";
import { GetAccountUseCase } from "../../application/use-cases/admin/get-account.use-case.js";
import { ListAccountsUseCase } from "../../application/use-cases/admin/list-accounts.use-case.js";
import { SetAccountPermissionsUseCase } from "../../application/use-cases/admin/set-account-permissions.use-case.js";
import { SetBetaAccessUseCase } from "../../application/use-cases/admin/set-beta-access.use-case.js";
import { UnblockAccountUseCase } from "../../application/use-cases/admin/unblock-account.use-case.js";
import { Permission } from "../../domain/account-role.js";
import { CurrentAccount } from "./decorators/current-account.decorator.js";
import { RequirePermissions } from "./decorators/require-permissions.decorator.js";
import {
  accountQuerySchema,
  betaAccessSchema,
  blockSchema,
  catechistDecisionSchema,
  permissionsSchema,
  type AccountQueryParams,
  type BetaAccessBody,
  type BlockBody,
  type CatechistDecisionBody,
  type PermissionsBody,
} from "./dtos/auth.schemas.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { PermissionsGuard } from "./guards/permissions.guard.js";

/** Administração geral: contas, permissões, bloqueios e aprovações. */
@ApiTags("Administração — contas")
@ApiBearerAuth()
@Controller("admin/accounts")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.SUPER_ADMIN)
export class AdminAccountsController {
  constructor(
    private readonly listAccounts: ListAccountsUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly getStats: GetAccountStatsUseCase,
    private readonly setPermissions: SetAccountPermissionsUseCase,
    private readonly blockAccount: BlockAccountUseCase,
    private readonly unblockAccount: UnblockAccountUseCase,
    private readonly decideCatechist: DecideCatechistUseCase,
    private readonly setBetaAccess: SetBetaAccessUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista contas" })
  @ApiZodQuery(accountQuerySchema)
  list(
    @CurrentAccount() actor: AccessTokenClaims,
    @Query(new ZodValidationPipe(accountQuerySchema)) query: AccountQueryParams,
  ) {
    return this.listAccounts.execute({ ...query, actorId: actor.accountId });
  }

  @Get("stats")
  @ApiOperation({ summary: "Números para a visão geral" })
  stats(@CurrentAccount() actor: AccessTokenClaims) {
    return this.getStats.execute({ actorId: actor.accountId });
  }

  @Get(":id")
  @ApiOperation({ summary: "Uma conta" })
  @ApiParam({ name: "id", format: "uuid" })
  get(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.getAccount.execute({ actorId: actor.accountId, accountId: id });
  }

  @Put(":id/permissions")
  @ApiOperation({ summary: "Substitui as permissões" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(permissionsSchema)
  permissions(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(permissionsSchema)) body: PermissionsBody,
  ) {
    return this.setPermissions.execute({ ...body, actorId: actor.accountId, accountId: id });
  }

  @Post(":id/block")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bloqueia a conta e termina as sessões" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(blockSchema)
  block(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(blockSchema)) body: BlockBody,
  ) {
    return this.blockAccount.execute({ ...body, actorId: actor.accountId, accountId: id });
  }

  @Post(":id/unblock")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Desbloqueia a conta" })
  @ApiParam({ name: "id", format: "uuid" })
  unblock(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.unblockAccount.execute({ actorId: actor.accountId, accountId: id });
  }

  @Post(":id/catechist-decision")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aprova ou recusa um catequista" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(catechistDecisionSchema)
  catechistDecision(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(catechistDecisionSchema)) body: CatechistDecisionBody,
  ) {
    return this.decideCatechist.execute({ ...body, actorId: actor.accountId, accountId: id });
  }

  @Put(":id/beta-access")
  @ApiOperation({ summary: "Dá ou retira o acesso de testes" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(betaAccessSchema)
  betaAccess(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(betaAccessSchema)) body: BetaAccessBody,
  ) {
    return this.setBetaAccess.execute({ ...body, actorId: actor.accountId, accountId: id });
  }
}
