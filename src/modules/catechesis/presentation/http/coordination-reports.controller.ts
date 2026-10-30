import { Controller, Get, Header, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiTags } from "@nestjs/swagger";

import { csvResponse } from "../../../../shared/presentation/http/csv.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import {
  AuthGuard,
  CurrentAccount,
  Permission,
  PermissionsGuard,
  RequirePermissions,
  type AccessTokenClaims,
} from "../../../identity/index.js";
import {
  ExportReportUseCase,
  GetReportUseCase,
  REPORT_EXPORTS,
  type ReportExport,
} from "../../application/use-cases/coordination/reports.use-cases.js";
import { reportExportParam } from "./catechesis.schemas.js";
import { listedCenter, scopeOf } from "./http-center.js";

/** Coordenação: indicadores do ano e listas para exportar (os pagamentos pedem o financeiro). */
@ApiTags("Coordenação — relatórios")
@ApiBearerAuth()
@Controller("coordination/reports")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION)
export class CoordinationReportsController {
  constructor(
    private readonly report: GetReportUseCase,
    private readonly exportReport: ExportReportUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Indicadores do ano (os pagamentos só com acesso ao financeiro)" })
  getReport(@CurrentAccount() actor: AccessTokenClaims, @Query("centerId") centerId?: string) {
    return this.report.execute({
      canSeeFinance: actor.permissions.includes(Permission.FINANCE),
      centerId: listedCenter(scopeOf(actor), centerId),
    });
  }

  @Get("exports/:kind")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Lista do ano em CSV (ex.: catequizandos, turmas, pagamentos)" })
  @ApiParam({ name: "kind", enum: REPORT_EXPORTS })
  @ApiProduces("text/csv")
  async export(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("kind", new ZodValidationPipe(reportExportParam)) kind: ReportExport,
    @Query("centerId") centerId?: string,
  ) {
    return csvResponse(
      await this.exportReport.execute({
        kind,
        canSeeFinance: actor.permissions.includes(Permission.FINANCE),
        centerId: listedCenter(scopeOf(actor), centerId),
      }),
    );
  }
}
