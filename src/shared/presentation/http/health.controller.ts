import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@ApiTags("Saúde")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Para o balanceador/monitorização: a API responde e a base de dados também. */
  @Get()
  @ApiOperation({ summary: "A API e a base de dados respondem" })
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
