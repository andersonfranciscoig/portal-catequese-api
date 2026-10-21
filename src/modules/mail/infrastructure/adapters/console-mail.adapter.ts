import { Injectable, Logger } from "@nestjs/common";

import { MailPort, type SendMailInput } from "../../application/ports/mail.port.js";

@Injectable()
export class ConsoleMailAdapter extends MailPort {
  private readonly logger = new Logger(ConsoleMailAdapter.name);

  async send(input: SendMailInput): Promise<void> {
    this.logger.log(
      `[MAIL] to=${input.to.email} subject="${input.subject}" tags=${(input.tags ?? []).join(",")}`,
    );
    this.logger.debug(input.text);
  }
}
