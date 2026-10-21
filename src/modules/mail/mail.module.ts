import { Global, Logger, Module } from "@nestjs/common";

import { AppConfig } from "../../config/app-config.js";
import { Mailer } from "../../shared/application/mailer.js";
import { provideUseCase } from "../../shared/infrastructure/provide.js";
import { MailService } from "./application/mail.service.js";
import { MAIL_PORT } from "./application/ports/mail.port.js";
import { BrevoMailAdapter } from "./infrastructure/adapters/brevo-mail.adapter.js";
import { ConsoleMailAdapter } from "./infrastructure/adapters/console-mail.adapter.js";

@Global()
@Module({
  providers: [
    ConsoleMailAdapter,
    BrevoMailAdapter,
    {
      provide: MAIL_PORT,
      inject: [AppConfig, ConsoleMailAdapter, BrevoMailAdapter],
      useFactory: (
        config: AppConfig,
        consoleAdapter: ConsoleMailAdapter,
        brevo: BrevoMailAdapter,
      ) => {
        const provider = config.email.provider;
        if (provider === "brevo") {
          if (!config.email.apiKey?.trim()) {
            Logger.warn(
              "EMAIL_API_KEY em falta — crie em Brevo → SMTP & API → API keys e adicione ao .env",
              "MailModule",
            );
          }
          return brevo;
        }
        if (provider !== "console") {
          Logger.warn(`EMAIL_PROVIDER="${provider}" desconhecido — a usar console`, "MailModule");
        }
        return consoleAdapter;
      },
    },
    provideUseCase(MailService, [MAIL_PORT, AppConfig]),
    { provide: Mailer, useExisting: MailService },
  ],
  exports: [Mailer, MailService, MAIL_PORT],
})
export class MailModule {}
