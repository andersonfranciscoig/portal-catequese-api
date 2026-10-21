export abstract class Mailer {
  abstract sendRegisterOtp(input: { email: string; firstName: string; otp: string }): void;
  abstract sendPasswordReset(input: { email: string; firstName: string; token: string }): void;
  abstract sendPasswordChanged(input: { email: string; firstName: string }): void;
  abstract sendWelcome(input: { email: string; firstName: string; roleLabel: string }): void;
  abstract sendNotification(input: {
    email: string;
    firstName: string;
    title: string;
    body?: string;
    link?: string;
  }): void;
}
