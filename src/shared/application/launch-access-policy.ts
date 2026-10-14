export interface LaunchSnapshot {
  /** "BETA": só testadores aceites; "PUBLIC": aberto a todos. */
  mode: "BETA" | "PUBLIC";
  portalOpen: boolean;
  /** Aviso mostrado com o portal encerrado. */
  closedMessage?: string;
}

/**
 * O que os módulos precisam de saber da fase de lançamento (ex.: o de identidade,
 * ao deixar entrar). Contrato partilhado: o módulo `platform` implementa-o e quem
 * o usa não depende desse módulo.
 */
export abstract class LaunchAccessPolicy {
  abstract snapshot(): Promise<LaunchSnapshot>;
  /** Há um pedido de acesso aceite para este telefone (E.164) ou email? */
  abstract isApprovedForBeta(phone: string, email?: string): Promise<boolean>;
}
