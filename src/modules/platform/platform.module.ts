import { Global, Module } from "@nestjs/common";

import { ActivityRecorder } from "../../shared/application/activity-recorder.js";
import { EventBus } from "../../shared/application/event-bus.js";
import { LaunchAccessPolicy } from "../../shared/application/launch-access-policy.js";
import { Clock } from "../../shared/domain/clock.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { IdentityModule } from "../identity/index.js";
import { PlatformLaunchAccess } from "./application/platform-launch-access.js";
import { DecideAccessRequestUseCase } from "./application/use-cases/decide-access-request.use-case.js";
import {
  GetPlatformStatusUseCase,
  GetPublicStatusUseCase,
} from "./application/use-cases/get-platform-status.use-case.js";
import { ListAccessRequestsUseCase } from "./application/use-cases/list-access-requests.use-case.js";
import { SetLaunchModeUseCase } from "./application/use-cases/set-launch-mode.use-case.js";
import { SetPortalStatusUseCase } from "./application/use-cases/set-portal-status.use-case.js";
import { SubmitAccessRequestUseCase } from "./application/use-cases/submit-access-request.use-case.js";
import { AccessRequestRepository } from "./domain/repositories/access-request.repository.js";
import { PlatformSettingsRepository } from "./domain/repositories/platform-settings.repository.js";
import {
  PrismaAccessRequestRepository,
  PrismaPlatformSettingsRepository,
} from "./infrastructure/persistence/prisma/prisma-platform.repositories.js";
import { AdminPlatformController } from "./presentation/http/admin-platform.controller.js";
import { PublicPlatformController } from "./presentation/http/public-platform.controller.js";

const SETTINGS = PlatformSettingsRepository;
const REQUESTS = AccessRequestRepository;

/**
 * Módulo da plataforma: fase de lançamento, estado do portal e pedidos de acesso.
 * Global porque implementa o contrato partilhado `LaunchAccessPolicy`.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [PublicPlatformController, AdminPlatformController],
  providers: [
    { provide: SETTINGS, useClass: PrismaPlatformSettingsRepository },
    { provide: REQUESTS, useClass: PrismaAccessRequestRepository },
    {
      provide: LaunchAccessPolicy,
      inject: [SETTINGS, REQUESTS],
      useFactory: (settings: PlatformSettingsRepository, requests: AccessRequestRepository) =>
        new PlatformLaunchAccess(settings, requests),
    },
    provideUseCase(GetPublicStatusUseCase, [SETTINGS]),
    provideUseCase(GetPlatformStatusUseCase, [SETTINGS, REQUESTS]),
    provideUseCase(SetLaunchModeUseCase, [SETTINGS, REQUESTS, ActivityRecorder, Clock]),
    provideUseCase(SetPortalStatusUseCase, [SETTINGS, REQUESTS, ActivityRecorder, Clock]),
    provideUseCase(SubmitAccessRequestUseCase, [REQUESTS, ActivityRecorder, Clock]),
    provideUseCase(ListAccessRequestsUseCase, [REQUESTS]),
    provideUseCase(DecideAccessRequestUseCase, [REQUESTS, EventBus, ActivityRecorder, Clock]),
  ],
  exports: [LaunchAccessPolicy],
})
export class PlatformModule {}
