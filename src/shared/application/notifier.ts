/** Grupos que recebem uma notificação por terem uma permissão (o super admin tem todas). */
export type NotifiedPermission = "SUPER_ADMIN" | "COORDINATION" | "APPROVE_CATECHISTS" | "FINANCE";

export type NotificationAudience = { accountIds: string[] } | { permission: NotifiedPermission };

export interface NotificationMessage {
  to: NotificationAudience;
  /** Código estável (ex.: "catechesis.enrollment_confirmed"), para ícones e filtros. */
  kind: string;
  /** Frase curta: "Matrícula da Inês confirmada". */
  title: string;
  /** Detalhe opcional: "Turma A · Sábado de manhã · Sala 04". */
  body?: string;
  /** Caminho no portal para abrir ao tocar (ex.: "/portal/matriculas"). */
  link?: string;
  /** Quem fez a ação não é notificado (ex.: a administração que aprova a si própria). */
  exceptAccountId?: string;
}

/**
 * Envio de notificações dentro do portal. Os módulos notificam por esta porta;
 * o módulo `notifications` implementa-a (hoje guarda e mostra no sino; mais
 * tarde pode também enviar email ou SMS). Uma falha a notificar nunca anula a
 * ação que a originou.
 */
export abstract class Notifier {
  abstract notify(message: NotificationMessage): Promise<void>;
}
