/** Área do portal onde a ação aconteceu (para filtrar o registo de atividade). */
export type ActivityCategory =
  "AUTH" | "ENROLLMENT" | "FINANCE" | "SETTINGS" | "CATECHISTS" | "ADMIN" | "COMMUNICATION";

export interface ActivityRecord {
  /** Conta que fez a ação; vazio em ações anónimas (ex.: pedido de acesso, entrada falhada). */
  actorId?: string;
  category: ActivityCategory;
  /** Código estável (ex.: "identity.account_blocked"). */
  action: string;
  /** Frase para mostrar: "Bloqueou a conta de Ana Silva: …". */
  summary: string;
  /** Conta afetada pela ação, quando há uma. */
  targetAccountId?: string;
}

/**
 * Registo de atividade (quem fez o quê e quando). Os módulos registam por esta
 * porta; o módulo `audit` implementa-a. Num cenário distribuído, a implementação
 * passa a publicar num broker sem os módulos mudarem.
 */
export abstract class ActivityRecorder {
  abstract record(entry: ActivityRecord): Promise<void>;
}
