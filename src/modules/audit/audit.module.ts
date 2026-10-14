import { Global, Module } from "@nestjs/common";

import { ActivityRecorder } from "../../shared/application/activity-recorder.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { IdentityModule } from "../identity/index.js";
import { AuditActivityRecorder } from "./application/audit-activity-recorder.js";
import { AccountDirectory } from "./application/ports/account-directory.js";
import { ListActivityUseCase } from "./application/use-cases/list-activity.use-case.js";
import { ActivityRepository } from "./domain/repositories/activity.repository.js";
import { IdentityAccountDirectory } from "./infrastructure/identity/identity-account-directory.js";
import { PrismaActivityRepository } from "./infrastructure/persistence/prisma-activity.repository.js";
import { AdminActivityController } from "./presentation/http/admin-activity.controller.js";

/**
 * Módulo de auditoria: guarda e mostra o registo de atividade. Global porque
 * implementa a porta partilhada `ActivityRecorder`, usada por todos os módulos.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [AdminActivityController],
  providers: [
    { provide: ActivityRepository, useClass: PrismaActivityRepository },
    { provide: AccountDirectory, useClass: IdentityAccountDirectory },
    provideUseCase(AuditActivityRecorder, [ActivityRepository, Clock]),
    { provide: ActivityRecorder, useExisting: AuditActivityRecorder },
    provideUseCase(ListActivityUseCase, [ActivityRepository, AccountDirectory]),
  ],
  exports: [ActivityRecorder],
})
export class AuditModule {}
