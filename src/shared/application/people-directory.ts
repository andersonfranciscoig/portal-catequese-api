import type { NotifiedPermission } from "./notifier.js";

/** O que os outros módulos sabem de uma conta (sem dados sensíveis). */
export interface PersonSnapshot {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  roles: ("GUARDIAN" | "CATECHUMEN" | "CATECHIST")[];
  /** Tem o papel de catequista e foi aprovado pela coordenação. */
  approvedCatechist: boolean;
  /** Não está bloqueada. */
  active: boolean;
}

/**
 * Consulta de pessoas (contas) para os módulos que não são o de identidade:
 * nomes, contactos e papéis. Contrato partilhado: o módulo `identity`
 * implementa-o, quem o usa não depende desse módulo.
 */
export abstract class PeopleDirectory {
  abstract find(id: string): Promise<PersonSnapshot | null>;
  /** As que existirem, pela mesma ordem (ids desconhecidos ficam de fora). */
  abstract findMany(ids: string[]): Promise<PersonSnapshot[]>;
  /** Contas ativas que têm a permissão em vigor (o super admin tem todas). */
  abstract idsWithPermission(permission: NotifiedPermission): Promise<string[]>;
}
