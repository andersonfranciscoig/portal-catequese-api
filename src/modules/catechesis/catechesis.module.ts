import { Module } from "@nestjs/common";

import { ActivityRecorder } from "../../shared/application/activity-recorder.js";
import { PeopleDirectory } from "../../shared/application/people-directory.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { IdentityModule } from "../identity/index.js";
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
} from "./application/use-cases/coordination/calendar.use-cases.js";
import {
  AssignCatechistsUseCase,
  CreateClassUseCase,
  ListClassesUseCase,
} from "./application/use-cases/coordination/class.use-cases.js";
import {
  DecideEnrollmentUseCase,
  ListEnrollmentsUseCase,
} from "./application/use-cases/coordination/enrollment.use-cases.js";
import { GetCatechumenProfileUseCase } from "./application/use-cases/family/get-catechumen-profile.use-case.js";
import { GetFamilyUseCase } from "./application/use-cases/family/get-family.use-case.js";
import { SubmitEnrollmentUseCase } from "./application/use-cases/family/submit-enrollment.use-case.js";
import {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
  EvaluationRepository,
} from "./domain/repositories/catechesis.repositories.js";
import {
  PrismaAttendanceRepository,
  PrismaCalendarRepository,
  PrismaCatechumenRepository,
  PrismaClassRepository,
  PrismaEnrollmentRepository,
  PrismaEvaluationRepository,
} from "./infrastructure/persistence/prisma/prisma-catechesis.repositories.js";
import { CatechistController } from "./presentation/http/catechist.controller.js";
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

/**
 * Módulo da catequese: catequizandos, matrículas, turmas, presenças e avaliações.
 * Das contas só conhece o contrato `PeopleDirectory` (implementado pela identidade).
 */
@Module({
  // A identidade dá os guards (sessão e permissões) e o diretório de pessoas.
  imports: [IdentityModule],
  controllers: [FamilyController, CatechistController, CoordinationController],
  providers: [
    { provide: CALENDAR, useClass: PrismaCalendarRepository },
    { provide: CATECHUMENS, useClass: PrismaCatechumenRepository },
    { provide: ENROLLMENTS, useClass: PrismaEnrollmentRepository },
    { provide: CLASSES, useClass: PrismaClassRepository },
    { provide: ATTENDANCE, useClass: PrismaAttendanceRepository },
    { provide: EVALUATIONS, useClass: PrismaEvaluationRepository },
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
    ]),
    provideUseCase(SubmitEnrollmentUseCase, [
      CATECHUMENS,
      ENROLLMENTS,
      CALENDAR,
      CatechesisAccess,
      EnrollmentCodes,
      AUDIT,
      Clock,
    ]),
    // Catequista
    provideUseCase(GetMyClassUseCase, [RESOLVER, ATTENDANCE, PEOPLE]),
    provideUseCase(GetRollUseCase, [RESOLVER, ATTENDANCE]),
    provideUseCase(SaveRollUseCase, [RESOLVER, ATTENDANCE, AUDIT, Clock]),
    provideUseCase(GetEvaluationsUseCase, [RESOLVER, ATTENDANCE, EVALUATIONS]),
    provideUseCase(SaveEvaluationsUseCase, [RESOLVER, ATTENDANCE, EVALUATIONS, AUDIT, Clock]),
    provideUseCase(GetClassCatechumenUseCase, [RESOLVER, ATTENDANCE, EVALUATIONS, PEOPLE]),
    // Coordenação
    provideUseCase(GetCalendarUseCase, [CALENDAR]),
    provideUseCase(SetCalendarUseCase, [CALENDAR, AUDIT, Clock]),
    provideUseCase(ListClassesUseCase, [CLASSES, ENROLLMENTS, CALENDAR, PEOPLE, Clock]),
    provideUseCase(CreateClassUseCase, [CLASSES, CALENDAR, PEOPLE, AUDIT, Clock]),
    provideUseCase(AssignCatechistsUseCase, [CLASSES, ENROLLMENTS, CALENDAR, PEOPLE, AUDIT, Clock]),
    provideUseCase(ListEnrollmentsUseCase, [ENROLLMENTS, CATECHUMENS, CALENDAR]),
    provideUseCase(DecideEnrollmentUseCase, [ENROLLMENTS, CLASSES, CATECHUMENS, AUDIT, Clock]),
  ],
})
export class CatechesisModule {}
