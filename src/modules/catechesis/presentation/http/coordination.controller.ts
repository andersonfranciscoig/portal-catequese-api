import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import { ApiZodBody, ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
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
  GetCalendarUseCase,
  SetCalendarUseCase,
} from "../../application/use-cases/coordination/calendar.use-cases.js";
import {
  AssignCatechistsUseCase,
  CreateClassUseCase,
  ListClassesUseCase,
} from "../../application/use-cases/coordination/class.use-cases.js";
import {
  DecideEnrollmentUseCase,
  ListEnrollmentsUseCase,
} from "../../application/use-cases/coordination/enrollment.use-cases.js";
import {
  calendarSchema,
  classCatechistsSchema,
  createClassSchema,
  enrollmentDecisionSchema,
  enrollmentListSchema,
  type CalendarBody,
  type ClassCatechistsBody,
  type CreateClassBody,
  type EnrollmentDecisionBody,
  type EnrollmentListQuery,
} from "./catechesis.schemas.js";

/** Coordenação da catequese: ano catequético, turmas e matrículas. */
@ApiTags("Coordenação — catequese")
@ApiBearerAuth()
@Controller("coordination")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION)
export class CoordinationController {
  constructor(
    private readonly getCalendar: GetCalendarUseCase,
    private readonly setCalendar: SetCalendarUseCase,
    private readonly listClasses: ListClassesUseCase,
    private readonly createClass: CreateClassUseCase,
    private readonly assignCatechists: AssignCatechistsUseCase,
    private readonly listEnrollments: ListEnrollmentsUseCase,
    private readonly decideEnrollment: DecideEnrollmentUseCase,
  ) {}

  @Get("calendar")
  @ApiOperation({ summary: "Ano catequético em curso" })
  calendar() {
    return this.getCalendar.execute();
  }

  @Put("calendar")
  @ApiOperation({ summary: "Define o ano catequético e as datas da catequese" })
  @ApiZodBody(calendarSchema)
  updateCalendar(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(calendarSchema)) body: CalendarBody,
  ) {
    return this.setCalendar.execute({ ...body, actorId: actor.accountId });
  }

  @Get("classes")
  @ApiOperation({ summary: "Turmas do ano" })
  classes() {
    return this.listClasses.execute();
  }

  @Post("classes")
  @ApiOperation({ summary: "Cria uma turma no ano em curso" })
  @ApiZodBody(createClassSchema)
  create(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(createClassSchema)) body: CreateClassBody,
  ) {
    return this.createClass.execute({ ...body, actorId: actor.accountId });
  }

  @Put("classes/:id/catechists")
  @ApiOperation({ summary: "Define os catequistas da turma" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(classCatechistsSchema)
  catechists(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(classCatechistsSchema)) body: ClassCatechistsBody,
  ) {
    return this.assignCatechists.execute({ ...body, actorId: actor.accountId, classId: id });
  }

  @Get("enrollments")
  @ApiOperation({ summary: "Matrículas do ano" })
  @ApiZodQuery(enrollmentListSchema)
  enrollments(@Query(new ZodValidationPipe(enrollmentListSchema)) query: EnrollmentListQuery) {
    return this.listEnrollments.execute(query);
  }

  @Post("enrollments/:id/decision")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirma a matrícula numa turma ou recusa-a" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(enrollmentDecisionSchema)
  decide(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(enrollmentDecisionSchema)) body: EnrollmentDecisionBody,
  ) {
    return this.decideEnrollment.execute({ ...body, actorId: actor.accountId, enrollmentId: id });
  }
}
