import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { RealtimeBus } from "../../../../shared/application/realtime-bus.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";

/** Intervalo do comentário `: ping` (mantém a ligação viva em proxies). */
const HEARTBEAT_MS = 25_000;

/**
 * Eventos em tempo real da conta (Server-Sent Events): mensagens novas,
 * leituras e notificações. Autenticado com o cabeçalho Bearer habitual (o
 * portal lê-o com `fetch` em streaming, não com `EventSource`).
 */
@ApiTags("Tempo real")
@ApiBearerAuth()
@Controller("me/stream")
@UseGuards(AuthGuard)
export class StreamController {
  constructor(private readonly realtime: RealtimeBus) {}

  @Get()
  @ApiProduces("text/event-stream")
  @ApiOperation({
    summary: "Eventos em tempo real (message.created, conversation.read, notification.created)",
  })
  stream(
    @CurrentAccount() account: AccessTokenClaims,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    // Sem buffer no nginx (senão os eventos chegam todos de uma vez).
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    request.socket.setKeepAlive(true);
    request.socket.setTimeout(0);

    const write = (chunk: string) => {
      if (!response.writableEnded) response.write(chunk);
    };
    write(": connected\n\n");

    const unsubscribe = this.realtime.subscribe(account.accountId, (event) => {
      write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    });
    const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!response.writableEnded) response.end();
    };
    request.on("close", close);
    response.on("error", close);
  }
}
