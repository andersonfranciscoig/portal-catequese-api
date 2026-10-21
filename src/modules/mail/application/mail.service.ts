import { Mailer } from "../../../shared/application/mailer.js";
import type { AppConfig } from "../../../config/app-config.js";
import * as T from "../templates/index.js";
import type { MailPort } from "./ports/mail.port.js";

/** Envia os emails do portal. Uma falha no envio nunca anula a acção que o originou. */
export class MailService extends Mailer {
  constructor(
    private readonly mail: MailPort,
    private readonly config: AppConfig,
  ) {
    super();
  }

  private dispatch(promise: Promise<void>, context: string) {
    void promise.catch((err) => {
      console.error(`Mail failed (${context}): ${err instanceof Error ? err.message : err}`);
    });
  }

  private send(to: { email: string; name?: string }, rendered: T.RenderedEmail, tag: string) {
    return this.mail.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [tag],
    });
  }

  sendRegisterOtp(input: { email: string; firstName: string; otp: string }) {
    const rendered = T.authVerifyOtp({
      firstName: input.firstName,
      otp: input.otp,
      expiresMinutes: 10,
    });
    this.dispatch(
      this.send({ email: input.email, name: input.firstName }, rendered, "auth.verify-otp"),
      "auth.verify-otp",
    );
  }

  sendPasswordReset(input: { email: string; firstName: string; token: string }) {
    const resetUrl = `${this.config.frontendUrl}/recuperar?token=${encodeURIComponent(input.token)}&email=${encodeURIComponent(input.email)}`;
    const rendered = T.authPasswordReset({
      firstName: input.firstName,
      resetUrl,
      expiresMinutes: 60,
    });
    this.dispatch(
      this.send({ email: input.email, name: input.firstName }, rendered, "auth.password-reset"),
      "auth.password-reset",
    );
  }

  sendPasswordChanged(input: { email: string; firstName: string }) {
    const rendered = T.authPasswordChanged({ firstName: input.firstName });
    this.dispatch(
      this.send({ email: input.email, name: input.firstName }, rendered, "auth.password-changed"),
      "auth.password-changed",
    );
  }

  sendWelcome(input: { email: string; firstName: string; roleLabel: string }) {
    const rendered = T.authWelcome({
      firstName: input.firstName,
      roleLabel: input.roleLabel,
      portalUrl: `${this.config.frontendUrl}/portal`,
    });
    this.dispatch(
      this.send({ email: input.email, name: input.firstName }, rendered, "auth.welcome"),
      "auth.welcome",
    );
  }

  sendNotification(input: {
    email: string;
    firstName: string;
    title: string;
    body?: string;
    link?: string;
  }) {
    const rendered = T.portalNotification({
      firstName: input.firstName,
      title: input.title,
      body: input.body,
      linkUrl: input.link ? `${this.config.frontendUrl}${input.link}` : undefined,
    });
    this.dispatch(
      this.send({ email: input.email, name: input.firstName }, rendered, "portal.notification"),
      "portal.notification",
    );
  }
}
