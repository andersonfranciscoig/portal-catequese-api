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

import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import {
  AuthGuard,
  CurrentAccount,
  Permission,
  PermissionsGuard,
  RequirePermissions,
  type AccessTokenClaims,
} from "../../../identity/index.js";
import { DecideAccessRequestUseCase } from "../../application/use-cases/decide-access-request.use-case.js";
import { GetPlatformStatusUseCase } from "../../application/use-cases/get-platform-status.use-case.js";
import { ListAccessRequestsUseCase } from "../../application/use-cases/list-access-requests.use-case.js";
import { SetLaunchModeUseCase } from "../../application/use-cases/set-launch-mode.use-case.js";
import { SetPortalStatusUseCase } from "../../application/use-cases/set-portal-status.use-case.js";
import {
  accessRequestListSchema,
  decisionSchema,
  launchModeSchema,
  portalStatusSchema,
  type AccessRequestListQuery,
  type DecisionBody,
  type LaunchModeBody,
  type PortalStatusBody,
} from "./platform.schemas.js";

/** Administração: fase de lançamento, estado do portal e pedidos de acesso. */
@Controller("admin/platform")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.SUPER_ADMIN)
export class AdminPlatformController {
  constructor(
    private readonly getStatus: GetPlatformStatusUseCase,
    private readonly setLaunchMode: SetLaunchModeUseCase,
    private readonly setPortalStatus: SetPortalStatusUseCase,
    private readonly listRequests: ListAccessRequestsUseCase,
    private readonly decideRequest: DecideAccessRequestUseCase,
  ) {}

  @Get("status")
  status() {
    return this.getStatus.execute();
  }

  /** Abrir o portal a todos (fim da fase de testes) ou voltar aos testes. */
  @Put("launch")
  launch(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(launchModeSchema)) body: LaunchModeBody,
  ) {
    return this.setLaunchMode.execute({ actorId: actor.accountId, mode: body.mode });
  }

  /** Encerrar ou reabrir o portal. */
  @Put("portal")
  portal(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(portalStatusSchema)) body: PortalStatusBody,
  ) {
    return this.setPortalStatus.execute({ ...body, actorId: actor.accountId });
  }

  @Get("access-requests")
  accessRequests(
    @Query(new ZodValidationPipe(accessRequestListSchema)) query: AccessRequestListQuery,
  ) {
    return this.listRequests.execute(query);
  }

  @Post("access-requests/:id/decision")
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: DecisionBody,
  ) {
    return this.decideRequest.execute({ ...body, actorId: actor.accountId, requestId: id });
  }
}
