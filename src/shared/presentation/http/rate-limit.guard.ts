import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

const RATE_LIMIT = "rate-limit";

export interface RateLimitOptions {
  /** Pedidos permitidos por janela. */
  limit: number;
  windowMs: number;
}

/** Limita os pedidos por IP a esta rota (ex.: impedir adivinhar números de matrícula). */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT, options);

/**
 * Limite simples em memória (por processo). Chega para uma instância; com várias,
 * passa a um armazenamento partilhado (ex.: Redis).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${context.getClass().name}.${context.getHandler().name}:${request.ip ?? "?"}`;
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + options.windowMs });
      this.prune(now);
      return true;
    }
    if (entry.count >= options.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: "rate_limited",
          message: "Demasiadas tentativas. Aguarde um minuto e tente de novo.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count++;
    return true;
  }

  /** Esquece janelas terminadas (para a memória não crescer). */
  private prune(now: number) {
    if (this.hits.size < 5_000) return;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
