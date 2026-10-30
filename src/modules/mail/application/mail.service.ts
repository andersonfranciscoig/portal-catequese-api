import type { AppConfig } from "../../../config/app-config.js";
import {
  Mailer,
  type AnnouncementMail,
  type PendingRollsDigestMail,
  type RollReminderMail,
} from "../../../shared/application/mailer.js";
import * as T from "../templates/index.js";
import type { MailPort } from "./ports/mail.port.js";

/** Envia os emails do portal. Uma falha no envio nunca anula a ação que o originou. */
export class MailService extends Mailer {
  private readonly brand: T.MailBrand;

  constructor(
    private readonly mail: MailPort,
    private readonly config: AppConfig,
  ) {
    super();
    this.brand = { portalUrl: config.frontendUrl, contactEmail: config.email.replyTo };
  }

  private dispatch(promise: Promise<void>, context: string) {
    void promise.catch((err) => {
      console.error(`Mail failed (${context}): ${err instanceof Error ? err.message : err}`);
    });
  }

  private send(to: { email: string; name?: string }, rendered: T.RenderedEmail, tag: string) {
    this.dispatch(
      this.mail.send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [tag],
      }),
      tag,
    );
  }

  /** Caminho do portal → endereço completo. */
  private url(path: string) {
    return `${this.config.frontendUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  sendRegisterOtp(input: { email: string; firstName: string; otp: string }) {
    this.send(
      { email: input.email, name: input.firstName },
      T.authVerifyOtp(this.brand, {
        firstName: input.firstName,
        otp: input.otp,
        expiresMinutes: 10,
      }),
      "auth.verify-otp",
    );
  }

  sendPasswordReset(input: { email: string; firstName: string; token: string }) {
    const resetUrl = this.url(
      `/recuperar?token=${encodeURIComponent(input.token)}&email=${encodeURIComponent(input.email)}`,
    );
    this.send(
      { email: input.email, name: input.firstName },
      T.authPasswordReset(this.brand, { firstName: input.firstName, resetUrl, expiresMinutes: 60 }),
      "auth.password-reset",
    );
  }

  sendPasswordChanged(input: { email: string; firstName: string }) {
    this.send(
      { email: input.email, name: input.firstName },
      T.authPasswordChanged(this.brand, { firstName: input.firstName }),
      "auth.password-changed",
    );
  }

  sendWelcome(input: { email: string; firstName: string; roleLabel: string }) {
    this.send(
      { email: input.email, name: input.firstName },
      T.authWelcome(this.brand, {
        firstName: input.firstName,
        roleLabel: input.roleLabel,
        portalUrl: this.url("/portal"),
      }),
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
    this.send(
      { email: input.email, name: input.firstName },
      T.portalNotification(this.brand, {
        firstName: input.firstName,
        title: input.title,
        body: input.body,
        linkUrl: input.link ? this.url(input.link) : undefined,
      }),
      "portal.notification",
    );
  }

  sendRollReminder(input: RollReminderMail) {
    this.send(
      { email: input.email, name: input.firstName },
      T.attendanceRollReminder(this.brand, {
        firstName: input.firstName,
        classLabel: input.classLabel,
        dayLabel: input.dayLabel,
        linkUrl: this.url(input.link),
      }),
      "attendance.roll-reminder",
    );
  }

  sendPendingRollsDigest(input: PendingRollsDigestMail) {
    this.send(
      { email: input.email, name: input.firstName },
      T.attendancePendingRollsDigest(this.brand, {
        firstName: input.firstName,
        items: input.items,
        linkUrl: this.url(input.link),
      }),
      "attendance.pending-rolls",
    );
  }

  sendAnnouncement(input: AnnouncementMail) {
    this.send(
      { email: input.email, name: input.firstName },
      T.portalAnnouncement(this.brand, {
        firstName: input.firstName,
        title: input.title,
        body: input.body,
        audienceLabel: input.audienceLabel,
        publishedAt: input.publishedAt,
        linkUrl: this.url(input.link),
      }),
      "portal.announcement",
    );
  }
}
