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

/** Alerta ao catequista: a chamada de um encontro ainda não foi lançada. */
export interface RollReminderMail {
  email: string;
  firstName: string;
  /** "Comunhão · 3.º ano · A" */
  classLabel: string;
  /** "sábado, 25/10" */
  dayLabel: string;
  /** Caminho no portal para lançar a chamada. */
  link: string;
}

/** Resumo para a coordenação: encontros com a chamada em atraso. */
export interface PendingRollsDigestMail {
  email: string;
  firstName: string;
  items: { classLabel: string; dayLabel: string; catechists: string[] }[];
  /** Caminho no portal (presenças da coordenação). */
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
  abstract sendRollReminder(input: RollReminderMail): void;
  abstract sendPendingRollsDigest(input: PendingRollsDigestMail): void;
}
