import type { AttendanceStatus } from "./catechesis.js";

/**
 * Estado do catequista: ativo (tem turma) e disponível (aprovado, sem turma)
 * vêm das turmas; os restantes são definidos pela coordenação.
 */
export const CATECHIST_STATUSES = [
  "ACTIVE",
  "AVAILABLE",
  "IN_TRAINING",
  "UNAVAILABLE",
  "INACTIVE",
] as const;
export type CatechistStatus = (typeof CATECHIST_STATUSES)[number];
export type ManualCatechistStatus = Exclude<CatechistStatus, "ACTIVE" | "AVAILABLE">;

export interface CatechistProfile {
  accountId: string;
  status?: ManualCatechistStatus;
  updatedAt: Date;
  updatedBy?: string;
}

/** O estado em vigor: o definido pela coordenação ou o que vem da turma. */
export function catechistStatus(
  profile: CatechistProfile | undefined,
  hasCurrentClass: boolean,
): CatechistStatus {
  return profile?.status ?? (hasCurrentClass ? "ACTIVE" : "AVAILABLE");
}

/** Presença do catequista principal num encontro da turma. */
export interface CatechistPresence {
  classId: string;
  date: string;
  status: AttendanceStatus;
  recordedBy: string;
  recordedAt: Date;
}
