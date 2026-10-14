import { Controller, Get } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Para o balanceador/monitorização: a API responde e a base de dados também. */
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
