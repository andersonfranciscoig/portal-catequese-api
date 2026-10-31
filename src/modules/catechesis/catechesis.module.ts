import { Module } from "@nestjs/common";

import { ActivityRecorder } from "../../shared/application/activity-recorder.js";
import { CatechesisRelations } from "../../shared/application/catechesis-relations.js";
import { EventBus } from "../../shared/application/event-bus.js";
import { FileStorage, UploadPolicy } from "../../shared/application/file-storage.js";
import { Mailer } from "../../shared/application/mailer.js";
import { Notifier } from "../../shared/application/notifier.js";
import { PaymentsLedger } from "../../shared/application/payments-ledger.js";
import { PeopleDirectory } from "../../shared/application/people-directory.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { AccountRepository, IdentityModule } from "../identity/index.js";
import { PaymentsModule } from "../payments/index.js";
import { CatechesisAccess } from "./application/catechesis-access.js";
import { CatechistClassResolver } from "./application/catechist-class.js";
import { EnrollmentCodes } from "./application/enrollment-codes.js";
import {
  GetClassCatechumenUseCase,
  GetEvaluationsUseCase,
  SaveEvaluationsUseCase,
} from "./application/use-cases/catechist/evaluation.use-cases.js";
import { GetMyClassUseCase } from "./application/use-cases/catechist/get-my-class.use-case.js";
import {
  GetRollUseCase,
  SaveRollUseCase,
} from "./application/use-cases/catechist/roll.use-cases.js";
import {
  GetCalendarUseCase,
  SetCalendarUseCase,
  SetDeadlineUseCase,
} from "./application/use-cases/coordination/calendar.use-cases.js";
import {
  AssignCatechistsUseCase,
  CreateClassUseCase,
  ListClassesUseCase,
} from "./application/use-cases/coordination/class.use-cases.js";
import {
  EnrollmentActionUseCase,
  GetEnrollmentDetailUseCase,
  ListEnrollmentsUseCase,
} from "./application/use-cases/coordination/enrollment.use-cases.js";
import {
  ListEnrollmentDocumentsUseCase,
  ReadEnrollmentDocumentUseCase,
  UploadEnrollmentDocumentUseCase,
} from "./application/use-cases/documents/enrollment-documents.use-cases.js";
import {
  ConfirmationCandidates,
  ConfirmEnrollmentUseCase,
  ListMyConfirmationsUseCase,
  SearchConfirmationsUseCase,
} from "./application/use-cases/family/confirmations.use-cases.js";
import { GetCatechumenProfileUseCase } from "./application/use-cases/family/get-catechumen-profile.use-case.js";
import { GetFamilyUseCase } from "./application/use-cases/family/get-family.use-case.js";
import { SubmitEnrollmentUseCase } from "./application/use-cases/family/submit-enrollment.use-case.js";
import {
  AnnouncementRepository,
  AttendanceRepository,
  CalendarActivityRepository,
  CalendarRepository,
  CenterRepository,
  CenterTransferRepository,
  CatechistPresenceRepository,
  CatechistProfileRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
  EvaluationRepository,
  RollReminderRepository,
  SacramentRecordRepository,
  SacramentRepository,
} from "./domain/repositories/catechesis.repositories.js";
import { SacramentRecords } from "./application/sacrament-records.js";
import {
  CreateCenterUseCase,
  ListActiveCentersUseCase,
  ListCentersUseCase,
  ListScopedCentersUseCase,
  UpdateCenterUseCase,
} from "./application/use-cases/centers.use-cases.js";
import {
  CancelCenterTransferUseCase,
  DecideCenterTransferUseCase,
  GetCenterTransferUseCase,
  ListCoordinationCenterTransfersUseCase,
  ListMyCenterTransfersUseCase,
  RequestCenterTransferUseCase,
} from "./application/use-cases/center-transfers.use-cases.js";
import { PrismaCenterRepository } from "./infrastructure/persistence/prisma/prisma-center.repository.js";
import { PrismaCenterTransferRepository } from "./infrastructure/persistence/prisma/prisma-center-transfer.repository.js";
import {
  AdminCentersController,
  CentersController,
  CoordinationCentersController,
} from "./presentation/http/centers.controller.js";
import {
  CompleteCelebrationUseCase,
  ListSacramentRecordsUseCase,
  SacramentRecordsSummaryUseCase,
  SetReceivedSacramentUseCase,
} from "./application/use-cases/coordination/sacrament-records.use-cases.js";
import {
  PrismaRollReminderRepository,
  PrismaSacramentRecordRepository,
  PrismaAnnouncementRepository,
  PrismaAttendanceRepository,
  PrismaCalendarRepository,
  PrismaCatechistPresenceRepository,
  PrismaCatechistProfileRepository,
  PrismaCatechumenRepository,
  PrismaClassRepository,
  PrismaEnrollmentDocumentRepository,
  PrismaEnrollmentRepository,
  PrismaEvaluationRepository,
  PrismaSacramentRepository,
} from "./infrastructure/persistence/prisma/prisma-catechesis.repositories.js";
import { PrismaCalendarActivityRepository } from "./infrastructure/persistence/prisma/prisma-calendar-activity.repository.js";
import { CatechistController } from "./presentation/http/catechist.controller.js";
import { CoordinationManagementController } from "./presentation/http/coordination-management.controller.js";
import { PublicCatechesisController } from "./presentation/http/public-catechesis.controller.js";
import { RateLimitGuard } from "../../shared/presentation/http/rate-limit.guard.js";
import {
  GetSessionUseCase,
  ListSessionDaysUseCase,
  SetCatechistPresenceUseCase,
} from "./application/use-cases/coordination/attendance.use-cases.js";
import {
  CatechistDirectory,
  GetCatechistProfileUseCase,
  ListCatechistsUseCase,
  SetCatechistStatusUseCase,
} from "./application/use-cases/coordination/catechists.use-cases.js";
import {
  GetCatechumenFileUseCase,
  ListCatechumensUseCase,
} from "./application/use-cases/coordination/catechumens.use-cases.js";
import {
  GetClassDetailUseCase,
  GetClassResultsUseCase,
  ListYearsUseCase,
} from "./application/use-cases/coordination/class-detail.use-cases.js";
import {
  ClassGeneration,
  GenerateClassesUseCase,
  PlanClassesUseCase,
} from "./application/use-cases/coordination/class-generation.use-cases.js";
import {
  DeleteCalendarActivityUseCase,
  ListCalendarActivitiesUseCase,
  ListPortalCalendarUseCase,
  SaveCalendarActivityUseCase,
} from "./application/use-cases/coordination/calendar-activities.use-cases.js";
import {
  DeleteAnnouncementUseCase,
  ListAnnouncementsUseCase,
  ListMyAnnouncementsUseCase,
  PublishAnnouncementUseCase,
  SetAnnouncementPinnedUseCase,
} from "./application/use-cases/coordination/announcements.use-cases.js";
import { GetOverviewUseCase } from "./application/use-cases/coordination/overview.use-case.js";
import {
  ExportReportUseCase,
  GetReportUseCase,
} from "./application/use-cases/coordination/reports.use-cases.js";
import {
  CreateCelebrationUseCase,
  DeleteCelebrationUseCase,
  GetSacramentsOverviewUseCase,
  ListCelebrationParticipantsUseCase,
  ListClassMembersForSacramentUseCase,
  ListSacramentCandidatesUseCase,
  ListSelectableClassesUseCase,
  SacramentCandidates,
  SacramentCelebrations,
  SetSacramentRequirementUseCase,
  UpdateCelebrationUseCase,
} from "./application/use-cases/coordination/sacraments.use-cases.js";
import {
  ListMyPendingRollsUseCase,
  ListPendingRollsUseCase,
  PendingRolls,
  SendRollRemindersUseCase,
} from "./application/use-cases/coordination/roll-reminders.use-cases.js";
import { RollRemindersScheduler } from "./infrastructure/jobs/roll-reminders.scheduler.js";
import { CoordinationMessenger } from "../../shared/application/coordination-messenger.js";
import { CoordinationAnnouncementsController } from "./presentation/http/coordination-announcements.controller.js";
import { CoordinationCalendarActivitiesController } from "./presentation/http/coordination-calendar.controller.js";
import { CoordinationReportsController } from "./presentation/http/coordination-reports.controller.js";
import { CoordinationSacramentsController } from "./presentation/http/coordination-sacraments.controller.js";
import { TrackEnrollmentUseCase } from "./application/use-cases/public/track-enrollment.use-case.js";
import { PrismaCatechesisRelations } from "./infrastructure/persistence/prisma/prisma-catechesis-relations.js";
import { CoordinationController } from "./presentation/http/coordination.controller.js";
import { FamilyController } from "./presentation/http/family.controller.js";

const CALENDAR = CalendarRepository;
const CATECHUMENS = CatechumenRepository;
const ENROLLMENTS = EnrollmentRepository;
const CLASSES = ClassRepository;
const ATTENDANCE = AttendanceRepository;
const EVALUATIONS = EvaluationRepository;
const AUDIT = ActivityRecorder;
const PEOPLE = PeopleDirectory;
const RESOLVER = CatechistClassResolver;
const DOCUMENTS = EnrollmentDocumentRepository;
const CANDIDATES = ConfirmationCandidates;
const PROFILES = CatechistProfileRepository;
const PRESENCE = CatechistPresenceRepository;
const SACRAMENTS = SacramentRepository;
const ANNOUNCEMENTS = AnnouncementRepository;
const ACTIVITIES = CalendarActivityRepository;
const REMINDERS = RollReminderRepository;
const RECORDS = SacramentRecordRepository;

/**
 * Módulo da catequese: catequizandos, matrículas, turmas, presenças e avaliações.
 * Das contas só conhece o contrato `PeopleDirectory` (implementado pela identidade).
 */
@Module({
  // A identidade dá os guards (sessão e permissões) e o diretório de pessoas;
  // os pagamentos, o contrato `PaymentsLedger` (relatórios).
  imports: [IdentityModule, PaymentsModule],
  controllers: [
    FamilyController,
    CatechistController,
    CoordinationController,
    CoordinationManagementController,
    CoordinationSacramentsController,
    CoordinationReportsController,
    CoordinationAnnouncementsController,
    CoordinationCalendarActivitiesController,
    PublicCatechesisController,
    CentersController,
    CoordinationCentersController,
    AdminCentersController,
  ],
  providers: [
    // Relações entre contas (contrato partilhado, usado pelas mensagens).
    { provide: CatechesisRelations, useClass: PrismaCatechesisRelations },
    { provide: CALENDAR, useClass: PrismaCalendarRepository },
    { provide: CATECHUMENS, useClass: PrismaCatechumenRepository },
    { provide: ENROLLMENTS, useClass: PrismaEnrollmentRepository },
    { provide: CLASSES, useClass: PrismaClassRepository },
    { provide: ATTENDANCE, useClass: PrismaAttendanceRepository },
    { provide: EVALUATIONS, useClass: PrismaEvaluationRepository },
    { provide: DOCUMENTS, useClass: PrismaEnrollmentDocumentRepository },
    { provide: PROFILES, useClass: PrismaCatechistProfileRepository },
    { provide: PRESENCE, useClass: PrismaCatechistPresenceRepository },
    { provide: SACRAMENTS, useClass: PrismaSacramentRepository },
    { provide: ANNOUNCEMENTS, useClass: PrismaAnnouncementRepository },
    { provide: ACTIVITIES, useClass: PrismaCalendarActivityRepository },
    { provide: REMINDERS, useClass: PrismaRollReminderRepository },
    { provide: RECORDS, useClass: PrismaSacramentRecordRepository },
    { provide: CenterRepository, useClass: PrismaCenterRepository },
    { provide: CenterTransferRepository, useClass: PrismaCenterTransferRepository },
    provideUseCase(ListActiveCentersUseCase, [CenterRepository]),
    provideUseCase(ListCentersUseCase, [CenterRepository]),
    provideUseCase(ListScopedCentersUseCase, [CenterRepository]),
    provideUseCase(CreateCenterUseCase, [CenterRepository, Clock]),
    provideUseCase(UpdateCenterUseCase, [CenterRepository, Clock]),
    RateLimitGuard,
    provideUseCase(CatechesisAccess, [PEOPLE]),
    provideUseCase(EnrollmentCodes, [ENROLLMENTS]),
    provideUseCase(RESOLVER, [
      CatechesisAccess,
      CALENDAR,
      CLASSES,
      ENROLLMENTS,
      CATECHUMENS,
      Clock,
    ]),
    // Família
    provideUseCase(GetFamilyUseCase, [CATECHUMENS, ENROLLMENTS, CLASSES, CALENDAR, PEOPLE, Clock]),
    provideUseCase(GetCatechumenProfileUseCase, [
      CATECHUMENS,
      ENROLLMENTS,
      CLASSES,
      ATTENDANCE,
      CALENDAR,
      PEOPLE,
      Clock,
      RECORDS,
    ]),
    provideUseCase(SubmitEnrollmentUseCase, [
      CATECHUMENS,
      ENROLLMENTS,
      CALENDAR,
      CatechesisAccess,
      EnrollmentCodes,
      AUDIT,
      Clock,
      Notifier,
      EventBus,
      SacramentRecords,
      CenterRepository,
    ]),
    provideUseCase(UploadEnrollmentDocumentUseCase, [
      ENROLLMENTS,
      CATECHUMENS,
      DOCUMENTS,
      FileStorage,
      UploadPolicy,
      AUDIT,
      Notifier,
      Clock,
    ]),
    provideUseCase(ListEnrollmentDocumentsUseCase, [ENROLLMENTS, CATECHUMENS, DOCUMENTS]),
    provideUseCase(ReadEnrollmentDocumentUseCase, [
      ENROLLMENTS,
      CATECHUMENS,
      DOCUMENTS,
      FileStorage,
    ]),
    provideUseCase(CANDIDATES, [
      CATECHUMENS,
      ENROLLMENTS,
      CLASSES,
      EVALUATIONS,
      ATTENDANCE,
      CALENDAR,
      PEOPLE,
      Clock,
    ]),
    provideUseCase(ListMyConfirmationsUseCase, [CATECHUMENS, CANDIDATES]),
    provideUseCase(SearchConfirmationsUseCase, [ENROLLMENTS, CATECHUMENS, CALENDAR, CANDIDATES]),
    provideUseCase(ConfirmEnrollmentUseCase, [
      CATECHUMENS,
      ENROLLMENTS,
      CANDIDATES,
      CatechesisAccess,
      EnrollmentCodes,
      CALENDAR,
      EventBus,
      AUDIT,
      Notifier,
      Clock,
      CenterRepository,
    ]),
    // Catequista
    provideUseCase(GetMyClassUseCase, [RESOLVER, ATTENDANCE, PEOPLE, CenterTransferRepository]),
    provideUseCase(GetRollUseCase, [RESOLVER, ATTENDANCE]),
    provideUseCase(SaveRollUseCase, [RESOLVER, ATTENDANCE, AUDIT, Clock, Notifier]),
    provideUseCase(GetEvaluationsUseCase, [RESOLVER, ATTENDANCE, EVALUATIONS]),
    provideUseCase(SaveEvaluationsUseCase, [RESOLVER, ATTENDANCE, EVALUATIONS, AUDIT, Clock]),
    provideUseCase(GetClassCatechumenUseCase, [
      RESOLVER,
      ATTENDANCE,
      EVALUATIONS,
      PEOPLE,
      CenterTransferRepository,
      CLASSES,
    ]),
    // Coordenação
    provideUseCase(GetCalendarUseCase, [CALENDAR]),
    provideUseCase(SetCalendarUseCase, [CALENDAR, AUDIT, Clock]),
    provideUseCase(SetDeadlineUseCase, [CALENDAR, AUDIT, Clock]),
    provideUseCase(ListYearsUseCase, [CLASSES, CALENDAR]),
    provideUseCase(GetClassDetailUseCase, [
      CLASSES,
      ENROLLMENTS,
      CATECHUMENS,
      ATTENDANCE,
      CALENDAR,
      PEOPLE,
      Clock,
    ]),
    provideUseCase(GetClassResultsUseCase, [
      CLASSES,
      ENROLLMENTS,
      CATECHUMENS,
      ATTENDANCE,
      EVALUATIONS,
    ]),
    provideUseCase(ClassGeneration, [CLASSES, ENROLLMENTS, CALENDAR, PROFILES, PEOPLE]),
    provideUseCase(PlanClassesUseCase, [ClassGeneration, CenterRepository]),
    provideUseCase(GenerateClassesUseCase, [
      ClassGeneration,
      CLASSES,
      ENROLLMENTS,
      EnrollmentActionUseCase,
      AUDIT,
      Clock,
      CenterRepository,
    ]),
    provideUseCase(CatechistDirectory, [
      PEOPLE,
      CLASSES,
      ENROLLMENTS,
      PROFILES,
      PRESENCE,
      CALENDAR,
    ]),
    provideUseCase(ListCatechistsUseCase, [CatechistDirectory]),
    provideUseCase(GetCatechistProfileUseCase, [CatechistDirectory]),
    provideUseCase(SetCatechistStatusUseCase, [PEOPLE, PROFILES, AUDIT, Clock, CenterRepository]),
    provideUseCase(ListSessionDaysUseCase, [CALENDAR, Clock]),
    provideUseCase(GetSessionUseCase, [
      CLASSES,
      ENROLLMENTS,
      ATTENDANCE,
      PRESENCE,
      CALENDAR,
      PEOPLE,
      Clock,
    ]),
    provideUseCase(SetCatechistPresenceUseCase, [
      CLASSES,
      PRESENCE,
      CALENDAR,
      AUDIT,
      Clock,
      Notifier,
      CoordinationMessenger,
    ]),
    provideUseCase(ListCatechumensUseCase, [
      ENROLLMENTS,
      CATECHUMENS,
      CLASSES,
      CALENDAR,
      PEOPLE,
      CenterTransferRepository,
    ]),
    provideUseCase(GetCatechumenFileUseCase, [
      CATECHUMENS,
      ENROLLMENTS,
      CLASSES,
      ATTENDANCE,
      EVALUATIONS,
      CALENDAR,
      PEOPLE,
      RECORDS,
      CenterTransferRepository,
    ]),
    provideUseCase(RequestCenterTransferUseCase, [
      CatechesisAccess,
      CenterTransferRepository,
      CATECHUMENS,
      ENROLLMENTS,
      CLASSES,
      CALENDAR,
      CenterRepository,
      PROFILES,
      PEOPLE,
      AUDIT,
      Clock,
      Notifier,
    ]),
    provideUseCase(ListMyCenterTransfersUseCase, [
      CenterTransferRepository,
      PEOPLE,
      CATECHUMENS,
      CLASSES,
    ]),
    provideUseCase(CancelCenterTransferUseCase, [CenterTransferRepository, Clock, AUDIT]),
    provideUseCase(ListCoordinationCenterTransfersUseCase, [
      CenterTransferRepository,
      PEOPLE,
      CATECHUMENS,
      CLASSES,
    ]),
    provideUseCase(GetCenterTransferUseCase, [
      CenterTransferRepository,
      ENROLLMENTS,
      CLASSES,
      CALENDAR,
      PEOPLE,
      CATECHUMENS,
    ]),
    provideUseCase(DecideCenterTransferUseCase, [
      CenterTransferRepository,
      CATECHUMENS,
      ENROLLMENTS,
      CLASSES,
      CALENDAR,
      PROFILES,
      AccountRepository,
      PEOPLE,
      AUDIT,
      Clock,
      Notifier,
    ]),
    provideUseCase(GetOverviewUseCase, [
      ENROLLMENTS,
      CATECHUMENS,
      CLASSES,
      CALENDAR,
      PEOPLE,
      Clock,
    ]),
    provideUseCase(TrackEnrollmentUseCase, [ENROLLMENTS, CATECHUMENS, CLASSES, PEOPLE]),
    provideUseCase(ListClassesUseCase, [CLASSES, ENROLLMENTS, CALENDAR, PEOPLE, Clock]),
    provideUseCase(CreateClassUseCase, [CLASSES, CALENDAR, PEOPLE, AUDIT, Clock, CenterRepository]),
    provideUseCase(AssignCatechistsUseCase, [
      CLASSES,
      ENROLLMENTS,
      CALENDAR,
      PEOPLE,
      AUDIT,
      Clock,
      Notifier,
    ]),
    provideUseCase(ListEnrollmentsUseCase, [ENROLLMENTS, CATECHUMENS, CLASSES, CALENDAR, PEOPLE]),
    provideUseCase(GetEnrollmentDetailUseCase, [
      ENROLLMENTS,
      CATECHUMENS,
      CLASSES,
      DOCUMENTS,
      PEOPLE,
    ]),
    provideUseCase(EnrollmentActionUseCase, [
      ENROLLMENTS,
      CLASSES,
      CATECHUMENS,
      AUDIT,
      Clock,
      Notifier,
    ]),
    // Sacramentos
    provideUseCase(SacramentCandidates, [
      CALENDAR,
      ENROLLMENTS,
      CATECHUMENS,
      CLASSES,
      ATTENDANCE,
      EVALUATIONS,
      DOCUMENTS,
      SACRAMENTS,
      PEOPLE,
      RECORDS,
    ]),
    provideUseCase(SacramentCelebrations, [SacramentCandidates, SACRAMENTS]),
    provideUseCase(GetSacramentsOverviewUseCase, [SacramentCelebrations]),
    provideUseCase(ListSacramentCandidatesUseCase, [SacramentCandidates]),
    provideUseCase(SetSacramentRequirementUseCase, [
      SacramentCandidates,
      SACRAMENTS,
      CATECHUMENS,
      AUDIT,
      Clock,
    ]),
    provideUseCase(CreateCelebrationUseCase, [
      SacramentCelebrations,
      SACRAMENTS,
      AUDIT,
      Clock,
      CenterRepository,
    ]),
    provideUseCase(UpdateCelebrationUseCase, [SacramentCelebrations, SACRAMENTS, AUDIT, Clock]),
    provideUseCase(DeleteCelebrationUseCase, [SacramentCelebrations, SACRAMENTS, AUDIT]),
    provideUseCase(ListCelebrationParticipantsUseCase, [SacramentCelebrations]),
    provideUseCase(ListSelectableClassesUseCase, [SacramentCelebrations]),
    provideUseCase(ListClassMembersForSacramentUseCase, [SacramentCelebrations]),
    // Sacramentos recebidos e realizados
    provideUseCase(SacramentRecords, [RECORDS, Clock]),
    provideUseCase(SetReceivedSacramentUseCase, [CATECHUMENS, SacramentRecords, AUDIT]),
    provideUseCase(CompleteCelebrationUseCase, [
      SacramentCelebrations,
      SACRAMENTS,
      RECORDS,
      SacramentRecords,
      CATECHUMENS,
      AUDIT,
      Clock,
    ]),
    provideUseCase(ListSacramentRecordsUseCase, [
      RECORDS,
      CATECHUMENS,
      ENROLLMENTS,
      CLASSES,
      SACRAMENTS,
      PEOPLE,
    ]),
    provideUseCase(SacramentRecordsSummaryUseCase, [RECORDS]),
    // Chamadas em atraso e alertas
    provideUseCase(PendingRolls, [ATTENDANCE, REMINDERS, PEOPLE]),
    provideUseCase(ListPendingRollsUseCase, [CALENDAR, CLASSES, PendingRolls, Clock]),
    provideUseCase(ListMyPendingRollsUseCase, [
      CatechesisAccess,
      CALENDAR,
      CLASSES,
      PendingRolls,
      Clock,
    ]),
    provideUseCase(SendRollRemindersUseCase, [
      CALENDAR,
      CLASSES,
      PendingRolls,
      REMINDERS,
      PEOPLE,
      Notifier,
      Mailer,
      CoordinationMessenger,
      Clock,
    ]),
    RollRemindersScheduler,
    // Relatórios
    provideUseCase(GetReportUseCase, [
      CALENDAR,
      ENROLLMENTS,
      CLASSES,
      ATTENDANCE,
      EVALUATIONS,
      PaymentsLedger,
      Clock,
    ]),
    provideUseCase(ExportReportUseCase, [
      CALENDAR,
      ENROLLMENTS,
      ListCatechumensUseCase,
      ListClassesUseCase,
      ListSessionDaysUseCase,
      GetSessionUseCase,
      PaymentsLedger,
    ]),
    // Avisos
    provideUseCase(ListAnnouncementsUseCase, [ANNOUNCEMENTS, PEOPLE]),
    provideUseCase(PublishAnnouncementUseCase, [
      ANNOUNCEMENTS,
      PEOPLE,
      AUDIT,
      Notifier,
      Mailer,
      Clock,
      CenterRepository,
    ]),
    provideUseCase(SetAnnouncementPinnedUseCase, [ANNOUNCEMENTS, PEOPLE, AUDIT, Clock]),
    provideUseCase(DeleteAnnouncementUseCase, [ANNOUNCEMENTS, AUDIT]),
    provideUseCase(ListMyAnnouncementsUseCase, [ANNOUNCEMENTS, Clock, CATECHUMENS, PROFILES]),
    provideUseCase(ListCalendarActivitiesUseCase, [ACTIVITIES]),
    provideUseCase(SaveCalendarActivityUseCase, [ACTIVITIES, AUDIT, Clock]),
    provideUseCase(DeleteCalendarActivityUseCase, [ACTIVITIES, AUDIT]),
    provideUseCase(ListPortalCalendarUseCase, [CALENDAR, SACRAMENTS, ACTIVITIES, Clock]),
  ],
  exports: [CatechesisRelations],
})
export class CatechesisModule {}
