import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { GetPublicStatusUseCase } from "../../application/use-cases/get-platform-status.use-case.js";
import { SubmitAccessRequestUseCase } from "../../application/use-cases/submit-access-request.use-case.js";
import { accessRequestSchema, type AccessRequestBody } from "./platform.schemas.js";

/** Rotas públicas (sem sessão): estado do portal e pedidos de acesso. */
@ApiTags("Plataforma")
@Controller("platform")
export class PublicPlatformController {
  constructor(
    private readonly getStatus: GetPublicStatusUseCase,
    private readonly submitRequest: SubmitAccessRequestUseCase,
  ) {}

  /** Fase de lançamento e portal aberto ou encerrado (o front-end decide o que mostrar). */
  @Get("status")
  @ApiOperation({ summary: "Fase de lançamento e portal aberto ou encerrado" })
  status() {
    return this.getStatus.execute();
  }

  @Post("access-requests")
  @ApiOperation({ summary: "Pede acesso à fase de testes" })
  @ApiZodBody(accessRequestSchema)
  requestAccess(@Body(new ZodValidationPipe(accessRequestSchema)) body: AccessRequestBody) {
    return this.submitRequest.execute(body);
  }
}
