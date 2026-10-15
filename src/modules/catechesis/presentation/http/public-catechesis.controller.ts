import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import {
  RateLimit,
  RateLimitGuard,
} from "../../../../shared/presentation/http/rate-limit.guard.js";
import { GetCalendarUseCase } from "../../application/use-cases/coordination/calendar.use-cases.js";
import { TrackEnrollmentUseCase } from "../../application/use-cases/public/track-enrollment.use-case.js";

/** Público (sem conta): ano catequético, prazos e acompanhamento da matrícula. */
@ApiTags("Público — catequese")
@Controller()
export class PublicCatechesisController {
  constructor(
    private readonly calendar: GetCalendarUseCase,
    private readonly track: TrackEnrollmentUseCase,
  ) {}

  @Get("catechesis/calendar")
  @ApiOperation({ summary: "Ano catequético e prazos de matrícula e confirmação" })
  getCalendar() {
    return this.calendar.execute();
  }

  @Get("public/enrollments/:code")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: "Estado de uma matrícula pelo número (sem dados pessoais completos)" })
  @ApiParam({ name: "code", example: "CRP-2026-48213" })
  trackEnrollment(@Param("code") code: string) {
    return this.track.execute({ code });
  }
}
