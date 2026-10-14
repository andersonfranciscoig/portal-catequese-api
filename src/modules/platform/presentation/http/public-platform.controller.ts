import { Body, Controller, Get, Post } from "@nestjs/common";

import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { GetPublicStatusUseCase } from "../../application/use-cases/get-platform-status.use-case.js";
import { SubmitAccessRequestUseCase } from "../../application/use-cases/submit-access-request.use-case.js";
import { accessRequestSchema, type AccessRequestBody } from "./platform.schemas.js";

/** Rotas públicas (sem sessão): estado do portal e pedidos de acesso. */
@Controller("platform")
export class PublicPlatformController {
  constructor(
    private readonly getStatus: GetPublicStatusUseCase,
    private readonly submitRequest: SubmitAccessRequestUseCase,
  ) {}

  /** Fase de lançamento e portal aberto ou encerrado (o front-end decide o que mostrar). */
  @Get("status")
  status() {
    return this.getStatus.execute();
  }

  @Post("access-requests")
  requestAccess(@Body(new ZodValidationPipe(accessRequestSchema)) body: AccessRequestBody) {
    return this.submitRequest.execute(body);
  }
}
