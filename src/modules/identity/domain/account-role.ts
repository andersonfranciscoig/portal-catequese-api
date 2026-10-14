/**
 * Tipo de conta:
 * - GUARDIAN: encarregado que inscreve educandos menores
 * - CATECHUMEN: adulto (18+) que se inscreve a si próprio
 * - CATECHIST: catequista (a coordenação aprova a conta)
 */
export const AccountRole = {
  GUARDIAN: "GUARDIAN",
  CATECHUMEN: "CATECHUMEN",
  CATECHIST: "CATECHIST",
} as const;

export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole];

export const AccountApproval = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type AccountApproval = (typeof AccountApproval)[keyof typeof AccountApproval];

export const AccountStatus = {
  ACTIVE: "ACTIVE",
  /** Bloqueada pela administração: não entra e as sessões terminam. */
  BLOCKED: "BLOCKED",
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

/**
 * Permissões dadas pela administração, independentes do tipo de conta: um
 * encarregado ou um catequista pode (ou não) ter acesso à coordenação.
 */
export const Permission = {
  /** Administração geral do portal: tem todas as permissões. */
  SUPER_ADMIN: "SUPER_ADMIN",
  /** Área da coordenação. */
  COORDINATION: "COORDINATION",
  /** Menu financeiro. Requer coordenação. */
  FINANCE: "FINANCE",
  /** Matrículas e confirmações fora do prazo. Requer coordenação. */
  LATE_ENROLLMENT: "LATE_ENROLLMENT",
  /** Aprovar contas de catequista. Requer coordenação. */
  APPROVE_CATECHISTS: "APPROVE_CATECHISTS",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission);

/** Permissões que só fazem sentido com acesso à coordenação. */
export const COORDINATION_PERMISSIONS: readonly Permission[] = [
  Permission.FINANCE,
  Permission.LATE_ENROLLMENT,
  Permission.APPROVE_CATECHISTS,
];
