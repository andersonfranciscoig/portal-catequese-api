import { Mailer, type AnnouncementMail } from "../application/mailer.js";

export class RecordingMailer extends Mailer {
  readonly registerOtps: { email: string; firstName: string; otp: string }[] = [];
  readonly passwordResets: { email: string; firstName: string; token: string }[] = [];
  readonly passwordChanged: { email: string; firstName: string }[] = [];
  readonly welcomes: { email: string; firstName: string; roleLabel: string }[] = [];
  readonly notifications: {
    email: string;
    firstName: string;
    title: string;
    body?: string;
    link?: string;
  }[] = [];

  readonly announcements: AnnouncementMail[] = [];

  sendAnnouncement(input: AnnouncementMail) {
    this.announcements.push(input);
  }

  sendRegisterOtp(input: { email: string; firstName: string; otp: string }) {
    this.registerOtps.push(input);
  }

  sendPasswordReset(input: { email: string; firstName: string; token: string }) {
    this.passwordResets.push(input);
  }

  sendPasswordChanged(input: { email: string; firstName: string }) {
    this.passwordChanged.push(input);
  }

  sendWelcome(input: { email: string; firstName: string; roleLabel: string }) {
    this.welcomes.push(input);
  }

  sendNotification(input: {
    email: string;
    firstName: string;
    title: string;
    body?: string;
    link?: string;
  }) {
    this.notifications.push(input);
  }

  lastOtp(email?: string) {
    return email
      ? this.registerOtps.findLast((item) => item.email === email)
      : this.registerOtps.at(-1);
  }

  lastReset(email?: string) {
    return email
      ? this.passwordResets.findLast((item) => item.email === email)
      : this.passwordResets.at(-1);
  }
}
