import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

import { DomainError, type DomainErrorKind } from "../../domain/domain-error.js";

const STATUS: Record<DomainErrorKind, HttpStatus> = {
  validation: HttpStatus.UNPROCESSABLE_ENTITY,
  conflict: HttpStatus.CONFLICT,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
};

/** Traduz os erros de domínio para HTTP. O domínio não sabe o que é HTTP. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS[error.kind];
    response.status(status).json({
      ...error.details,
      statusCode: status,
      code: error.code,
      message: error.message,
    });
  }
}
