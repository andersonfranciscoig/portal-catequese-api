import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { z } from "zod";

import { AppModule } from "./app.module.js";
import { AppConfig } from "./config/app-config.js";
import { DomainErrorFilter } from "./shared/presentation/http/domain-error.filter.js";
import { setupSwagger } from "./shared/presentation/http/setup-swagger.js";

// Mensagens de validação em português.
z.config(z.locales.pt());

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfig);

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  if (config.env !== "production") {
    setupSwagger(app);
  }

  await app.listen(config.port);
}

void bootstrap();
