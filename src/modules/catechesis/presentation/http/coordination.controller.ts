import {
  Body,
  Controller,
  Get,
  Header,
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
import { fileResponse } from "../../../../shared/presentation/http/uploaded-file.js";
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
  EnrollmentActionUseCase,
  GetEnrollmentDetailUseCase,
  ListEnrollmentsUseCase,
} from "../../application/use-cases/coordination/enrollment.use-cases.js";
import { ReadEnrollmentDocumentUseCase } from "../../application/use-cases/documents/enrollment-documents.use-cases.js";
import {
  ConfirmEnrollmentUseCase,
  SearchConfirmationsUseCase,
} from "../../application/use-cases/family/confirmations.use-cases.js";
import {
  calendarSchema,
  classCatechistsSchema,
  confirmationSearchSchema,
  confirmSchema,
  createClassSchema,
  enrollmentActionSchema,
  enrollmentListSchema,
  type CalendarBody,
  type ClassCatechistsBody,
  type ConfirmBody,
  type CreateClassBody,
  type EnrollmentActionBody,
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
    private readonly enrollmentDetail: GetEnrollmentDetailUseCase,
    private readonly enrollmentAction: EnrollmentActionUseCase,
    private readonly readDocument: ReadEnrollmentDocumentUseCase,
    private readonly searchConfirmations: SearchConfirmationsUseCase,
    private readonly confirm: ConfirmEnrollmentUseCase,
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

  @Get("enrollments/:id")
  @ApiOperation({ summary: "Detalhe de uma matrícula" })
  @ApiParam({ name: "id", format: "uuid" })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.enrollmentDetail.execute({ enrollmentId: id });
  }

  @Post("enrollments/:id/actions")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Aprova, pede documentos, confirma numa turma, recusa, lista de espera ou reabre",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(enrollmentActionSchema)
  act(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(enrollmentActionSchema)) action: EnrollmentActionBody,
  ) {
    return this.enrollmentAction.execute({ actorId: actor.accountId, enrollmentId: id, action });
  }

  @Get("enrollments/:id/documents/:documentId/file")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  @ApiOperation({ summary: "Abre um documento da matrícula" })
  async documentFile(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    return fileResponse(await this.readDocument.execute({ enrollmentId: id, documentId }));
  }

  @Get("confirmations")
  @ApiOperation({ summary: "Procura matrículas do ano anterior para confirmar" })
  @ApiZodQuery(confirmationSearchSchema)
  confirmations(@Query(new ZodValidationPipe(confirmationSearchSchema)) query: { search: string }) {
    return this.searchConfirmations.execute(query);
  }

  @Post("confirmations")
  @ApiOperation({ summary: "Confirma a matrícula em nome da família" })
  @ApiZodBody(confirmSchema)
  confirmForFamily(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(confirmSchema)) body: ConfirmBody,
  ) {
    return this.confirm.execute({ ...body, actorId: actor.accountId, assisted: true });
  }
}
