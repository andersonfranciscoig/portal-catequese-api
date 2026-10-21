import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../../config/app-config.js";
import { MailPort, type SendMailInput } from "../../application/ports/mail.port.js";

@Injectable()
export class BrevoMailAdapter extends MailPort {
  private readonly logger = new Logger(BrevoMailAdapter.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async send(input: SendMailInput): Promise<void> {
    const apiKey = this.config.email.apiKey?.trim();
    if (!apiKey) {
      throw new Error("EMAIL_API_KEY em falta — crie uma chave em Brevo → SMTP & API → API keys");
    }
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: this.config.email.fromName, email: this.config.email.from },
        to: [{ email: input.to.email, name: input.to.name ?? input.to.email }],
        replyTo: {
          email: input.replyTo?.email ?? this.config.email.replyTo,
          name: input.replyTo?.name ?? this.config.email.fromName,
        },
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
        tags: input.tags,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      this.logger.error(`Brevo error ${res.status}: ${body}`);
      throw new Error(`Brevo mail failed: ${res.status}`);
    }
  }
}
