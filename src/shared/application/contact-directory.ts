/** Uma conta vista pelas mensagens: nome, papéis e se é da equipa da coordenação. */
export interface ContactPerson {
  id: string;
  fullName: string;
  roles: ("GUARDIAN" | "CATECHUMEN" | "CATECHIST")[];
  /**
   * Equipa da coordenação: "ADMIN" (administração geral) ou "COORDINATION"
   * (acesso à coordenação em vigor); `null` para as restantes contas.
   */
  staff: "ADMIN" | "COORDINATION" | null;
  /** Não está bloqueada. */
  active: boolean;
}

/**
 * Consulta de contas para as mensagens. Contrato partilhado: o módulo
 * `identity` implementa-o, quem o usa não depende desse módulo.
 */
export abstract class ContactDirectory {
  /** As que existirem (ids desconhecidos ficam de fora). */
  abstract findMany(ids: string[]): Promise<ContactPerson[]>;
  /** Contas ativas da equipa da coordenação (coordenação em vigor ou administração geral). */
  abstract staffIds(): Promise<string[]>;
  /** Contas ativas por nome, email ou telefone (sem termo: as primeiras por nome). */
  abstract search(term: string | undefined, limit: number): Promise<ContactPerson[]>;
}
