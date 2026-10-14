import { Module } from "@nestjs/common";

import { ConfigModule } from "./config/config.module.js";
import { AuditModule } from "./modules/audit/index.js";
import { CatechesisModule } from "./modules/catechesis/index.js";
import { IdentityModule } from "./modules/identity/index.js";
import { NotificationsModule } from "./modules/notifications/index.js";
import { PlatformModule } from "./modules/platform/index.js";
import { CoreModule } from "./shared/infrastructure/core.module.js";
import { DatabaseModule } from "./shared/infrastructure/database/database.module.js";
import { HealthController } from "./shared/presentation/http/health.controller.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CoreModule,
    AuditModule,
    NotificationsModule,
    PlatformModule,
    IdentityModule,
    CatechesisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
