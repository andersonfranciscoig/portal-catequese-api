import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import {
  AuthGuard,
  Permission,
  PermissionsGuard,
  RequirePermissions,
} from "../../../identity/index.js";
import {
  CreateCenterUseCase,
  ListActiveCentersUseCase,
  ListCentersUseCase,
  UpdateCenterUseCase,
} from "../../application/use-cases/centers.use-cases.js";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(160),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    location: z.string().trim().min(2).max(160).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((body) => body.name !== undefined || body.location !== undefined || body.status !== undefined, {
    message: "Indique o que quer alterar.",
  });

/** Centros ativos, para qualquer conta com sessão. */
@ApiTags("Centros")
@ApiBearerAuth()
@Controller("centers")
@UseGuards(AuthGuard)
export class CentersController {
  constructor(private readonly listActive: ListActiveCentersUseCase) {}

  @Get()
  @ApiOperation({ summary: "Centros de catequese ativos" })
  list() {
    return this.listActive.execute();
  }
}

/** Gestão dos centros (só a administração geral). */
@ApiTags("Administração — centros")
@ApiBearerAuth()
@Controller("admin/centers")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.SUPER_ADMIN)
export class AdminCentersController {
  constructor(
    private readonly listAll: ListCentersUseCase,
    private readonly createCenter: CreateCenterUseCase,
    private readonly updateCenter: UpdateCenterUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Todos os centros, inclusive inativos" })
  list() {
    return this.listAll.execute();
  }

  @Post()
  @ApiOperation({ summary: "Cria um centro ativo" })
  @ApiZodBody(createSchema)
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.createCenter.execute(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Altera o nome, a localização ou o estado de um centro" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(updateSchema)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.updateCenter.execute({ id, ...body });
  }
}
