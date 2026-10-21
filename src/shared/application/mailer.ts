/** Aviso da coordenação enviado por email (o texto completo). */
export interface AnnouncementMail {
  email: string;
  firstName: string;
  title: string;
  body: string;
  /** Ex.: "Encarregados de educação". */
  audienceLabel: string;
  publishedAt: Date;
  /** Caminho no portal (ex.: "/portal/catequese"). */
  link: string;
}

/**
 * Envio de emails (porta partilhada; o módulo `mail` implementa-a). O envio é
 * assíncrono e uma falha nunca anula a ação que o originou.
 */
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
  abstract sendAnnouncement(input: AnnouncementMail): void;
}
