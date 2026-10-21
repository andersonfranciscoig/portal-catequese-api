import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import {
  AuthGuard,
  Permission,
  PermissionsGuard,
  RequirePermissions,
} from "../../../identity/index.js";
import { ListActivityUseCase } from "../../application/use-cases/list-activity.use-case.js";

const activityQuerySchema = z.object({
  actorId: z.uuid().optional(),
  involvingAccountId: z.uuid().optional(),
  category: z
    .enum(["AUTH", "ENROLLMENT", "FINANCE", "SETTINGS", "CATECHISTS", "ADMIN", "COMMUNICATION"])
    .optional(),
  search: z
    .string()
    .max(120)
    .optional()
    .transform((value) => value?.trim() || undefined),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type ActivityQueryParams = z.infer<typeof activityQuerySchema>;

/** Registo de atividade (só a administração geral). */
@ApiTags("Administração — atividade")
@ApiBearerAuth()
@Controller("admin/activity")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.SUPER_ADMIN)
export class AdminActivityController {
  constructor(private readonly listActivity: ListActivityUseCase) {}

  @Get()
  @ApiOperation({ summary: "Lista a atividade" })
  @ApiZodQuery(activityQuerySchema)
  list(@Query(new ZodValidationPipe(activityQuerySchema)) query: ActivityQueryParams) {
    return this.listActivity.execute(query);
  }
}
