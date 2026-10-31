import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Query,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import { ApiZodBody, ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
import {
  fileResponse,
  SingleFileUpload,
  toIncoming,
  type UploadedFileData,
} from "../../../../shared/presentation/http/uploaded-file.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import {
  ListEnrollmentDocumentsUseCase,
  ReadEnrollmentDocumentUseCase,
  UploadEnrollmentDocumentUseCase,
} from "../../application/use-cases/documents/enrollment-documents.use-cases.js";
import {
  ConfirmEnrollmentUseCase,
  ListMyConfirmationsUseCase,
} from "../../application/use-cases/family/confirmations.use-cases.js";
import {
  CancelCenterTransferUseCase,
  ListMyCenterTransfersUseCase,
  RequestCenterTransferUseCase,
} from "../../application/use-cases/center-transfers.use-cases.js";
import { GetCatechumenProfileUseCase } from "../../application/use-cases/family/get-catechumen-profile.use-case.js";
import { GetFamilyUseCase } from "../../application/use-cases/family/get-family.use-case.js";
import { SubmitEnrollmentUseCase } from "../../application/use-cases/family/submit-enrollment.use-case.js";
import { ListMyAnnouncementsUseCase } from "../../application/use-cases/coordination/announcements.use-cases.js";
import { ListPortalCalendarUseCase } from "../../application/use-cases/coordination/calendar-activities.use-cases.js";
import {
  confirmSchema,
  documentKindSchema,
  myAnnouncementsSchema,
  portalRoleSchema,
  requestCenterTransferSchema,
  submitEnrollmentSchema,
  type ConfirmBody,
  type MyAnnouncementsQuery,
  type RequestCenterTransferBody,
  type SubmitEnrollmentBody,
} from "./catechesis.schemas.js";

/** Portal da família: o encarregado (educandos) ou o adulto (o próprio). */
@ApiTags("Portal — família")
@ApiBearerAuth()
@Controller("me")
@UseGuards(AuthGuard)
export class FamilyController {
  constructor(
    private readonly family: GetFamilyUseCase,
    private readonly profile: GetCatechumenProfileUseCase,
    private readonly submitEnrollment: SubmitEnrollmentUseCase,
    private readonly uploadDocument: UploadEnrollmentDocumentUseCase,
    private readonly listDocuments: ListEnrollmentDocumentsUseCase,
    private readonly readDocument: ReadEnrollmentDocumentUseCase,
    private readonly confirmations: ListMyConfirmationsUseCase,
    private readonly confirm: ConfirmEnrollmentUseCase,
    private readonly announcements: ListMyAnnouncementsUseCase,
    private readonly calendar: ListPortalCalendarUseCase,
    private readonly requestTransfer: RequestCenterTransferUseCase,
    private readonly myTransfers: ListMyCenterTransfersUseCase,
    private readonly cancelTransfer: CancelCenterTransferUseCase,
  ) {}

  @Get("family")
  @ApiOperation({ summary: "Educandos (ou o próprio) com a matrícula e a turma do ano" })
  getFamily(@CurrentAccount() account: AccessTokenClaims) {
    return this.family.execute({ accountId: account.accountId });
  }

  @Get("enrollments")
  @ApiOperation({ summary: "Todas as matrículas da família" })
  async enrollments(@CurrentAccount() account: AccessTokenClaims) {
    return (await this.family.execute({ accountId: account.accountId })).enrollments;
  }

  @Get("catechumens/:id")
  @ApiOperation({ summary: "Perfil de um educando (ou do próprio)" })
  @ApiParam({ name: "id", format: "uuid" })
  catechumen(@CurrentAccount() account: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.profile.execute({ accountId: account.accountId, catechumenId: id });
  }

  @Post("enrollments")
  @ApiOperation({ summary: "Submete uma matrícula (educando menor ou o próprio adulto)" })
  @ApiZodBody(submitEnrollmentSchema)
  enroll(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(submitEnrollmentSchema)) body: SubmitEnrollmentBody,
  ) {
    return this.submitEnrollment.execute({ ...body, accountId: account.accountId });
  }

  @Get("enrollments/:id/documents")
  @ApiOperation({ summary: "Documentos de uma matrícula" })
  @ApiParam({ name: "id", format: "uuid" })
  documents(@CurrentAccount() account: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.listDocuments.execute({ accountId: account.accountId, enrollmentId: id });
  }

  @Post("enrollments/:id/documents")
  @ApiOperation({ summary: "Anexa um documento (PDF ou fotografia; um de cada tipo)" })
  @ApiConsumes("multipart/form-data")
  @ApiParam({ name: "id", format: "uuid" })
  @UseInterceptors(SingleFileUpload())
  upload(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(documentKindSchema)) body: { kind: "ID" | "BAPTISM" | "PHOTO" },
    @UploadedFile() file?: UploadedFileData,
  ) {
    return this.uploadDocument.execute({
      accountId: account.accountId,
      enrollmentId: id,
      kind: body.kind,
      file: toIncoming(file),
    });
  }

  @Get("enrollments/:id/documents/:documentId/file")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  @ApiOperation({ summary: "Abre um documento da matrícula" })
  async documentFile(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    return fileResponse(
      await this.readDocument.execute({
        accountId: account.accountId,
        enrollmentId: id,
        documentId,
      }),
    );
  }

  @Get("announcements")
  @ApiOperation({ summary: "Avisos da coordenação para o papel em uso" })
  @ApiZodQuery(myAnnouncementsSchema)
  myAnnouncements(
    @CurrentAccount() account: AccessTokenClaims,
    @Query(new ZodValidationPipe(myAnnouncementsSchema)) query: MyAnnouncementsQuery,
  ) {
    return this.announcements.execute({
      accountId: account.accountId,
      roles: account.roles,
      role: query.role,
    });
  }

  @Get("calendar")
  @ApiOperation({ summary: "Calendário do papel: sacramentos e atividades visíveis" })
  @ApiZodQuery(portalRoleSchema)
  myCalendar(
    @CurrentAccount() account: AccessTokenClaims,
    @Query(new ZodValidationPipe(portalRoleSchema)) query: MyAnnouncementsQuery,
  ) {
    return this.calendar.execute({ roles: account.roles, role: query.role });
  }

  @Get("confirmations")
  @ApiOperation({ summary: "Anos concluídos que podem ser confirmados" })
  listConfirmations(@CurrentAccount() account: AccessTokenClaims) {
    return this.confirmations.execute({ accountId: account.accountId });
  }

  @Post("confirmations")
  @ApiOperation({ summary: "Confirma a matrícula no novo ano" })
  @ApiZodBody(confirmSchema)
  confirmEnrollment(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(confirmSchema)) body: ConfirmBody,
  ) {
    return this.confirm.execute({ ...body, actorId: account.accountId });
  }

  @Get("center-transfers")
  @ApiOperation({ summary: "Pedidos de mudança de centro da própria conta" })
  myCenterTransfers(@CurrentAccount() account: AccessTokenClaims) {
    return this.myTransfers.execute({ accountId: account.accountId });
  }

  @Post("center-transfers")
  @ApiOperation({ summary: "Pede para passar a frequentar outro centro da paróquia" })
  @ApiZodBody(requestCenterTransferSchema)
  requestCenterTransfer(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(requestCenterTransferSchema)) body: RequestCenterTransferBody,
  ) {
    return this.requestTransfer.execute({ ...body, accountId: account.accountId });
  }

  @Post("center-transfers/:id/cancel")
  @ApiOperation({ summary: "Cancela um pedido de mudança de centro ainda pendente" })
  @ApiParam({ name: "id", format: "uuid" })
  cancelCenterTransfer(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.cancelTransfer.execute({ accountId: account.accountId, id });
  }
}
