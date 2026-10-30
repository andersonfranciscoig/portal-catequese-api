import type { CatechesisLevel } from "./catechesis.js";
import type { EnrollmentDocumentKind } from "./enrollment-document.js";
import { PASS_ATTENDANCE, PASS_GRADE } from "./evaluation.js";

type ValueOf<T> = T[keyof T];

export const SacramentType = {
  BAPTISM: "BAPTISM",
  FIRST_COMMUNION: "FIRST_COMMUNION",
  CONFIRMATION: "CONFIRMATION",
} as const;
export type SacramentType = ValueOf<typeof SacramentType>;

export const SACRAMENT_TYPES = Object.values(SacramentType);

export const SacramentRequirement = {
  /** Do percurso (não se marcam). */
  BAPTIZED: "BAPTIZED",
  FIRST_COMMUNION: "FIRST_COMMUNION",
  /** Documentos: contam sozinhos se a família os enviou online. */
  BIRTH_CERTIFICATE: "BIRTH_CERTIFICATE",
  BAPTISM_CERTIFICATE: "BAPTISM_CERTIFICATE",
  /** Marcados pela coordenação. */
  RECONCILIATION: "RECONCILIATION",
  GODPARENT: "GODPARENT",
  PARENTS_MEETING: "PARENTS_MEETING",
} as const;
export type SacramentRequirement = ValueOf<typeof SacramentRequirement>;

/** Os que a coordenação pode marcar (guardados na base de dados). */
export type CheckableRequirement = Exclude<SacramentRequirement, "BAPTIZED" | "FIRST_COMMUNION">;

const FROM_RECORD: SacramentRequirement[] = ["BAPTIZED", "FIRST_COMMUNION"];

/** Documento da matrícula que cumpre o requisito. */
const FROM_DOCUMENT: Partial<Record<SacramentRequirement, EnrollmentDocumentKind>> = {
  BIRTH_CERTIFICATE: "ID",
  BAPTISM_CERTIFICATE: "BAPTISM",
};

/** Candidatos: o último ano da etapa que prepara o sacramento. */
export const CANDIDATE_LEVEL: Record<SacramentType, CatechesisLevel> = {
  BAPTISM: "BAPTISM_3",
  FIRST_COMMUNION: "COMMUNION_3",
  CONFIRMATION: "CONFIRMATION_3",
};

export const REQUIREMENTS: Record<SacramentType, SacramentRequirement[]> = {
  BAPTISM: ["BIRTH_CERTIFICATE", "GODPARENT", "PARENTS_MEETING"],
  FIRST_COMMUNION: ["BAPTIZED", "BAPTISM_CERTIFICATE", "RECONCILIATION"],
  CONFIRMATION: ["BAPTIZED", "FIRST_COMMUNION", "BAPTISM_CERTIFICATE", "GODPARENT"],
};

export function isCheckable(
  type: SacramentType,
  requirement: SacramentRequirement,
): requirement is CheckableRequirement {
  return REQUIREMENTS[type].includes(requirement) && !FROM_RECORD.includes(requirement);
}

/** Quem a coordenação escolheu para uma celebração (tudo vazio = modo automático). */
export interface CelebrationSelection {
  /** Turmas inteiras. */
  classIds: string[];
  /** Catequizandos escolhidos um a um (de qualquer turma do ano). */
  catechumenIds: string[];
}

/**
 * Uma celebração de um sacramento no ano. Pode haver várias do mesmo tipo,
 * cada uma com o seu grupo de participantes.
 */
export interface SacramentCelebration {
  id: string;
  catecheticalYear: string;
  type: SacramentType;
  /** YYYY-MM-DD */
  date: string;
  /** "HH:mm" */
  time?: string;
  place: string;
  notes?: string;
  centerId: string;
  selection: CelebrationSelection;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  updatedBy?: string;
  /** Concluída: a coordenação registou quem recebeu de facto. */
  completedAt?: Date;
  completedBy?: string;
}

export type CelebrationMode = "AUTO" | "MANUAL";
export type CelebrationStatus = "SCHEDULED" | "COMPLETED";

/** MANUAL quando a coordenação escolheu turmas ou catequizandos. */
export function celebrationMode(selection: CelebrationSelection): CelebrationMode {
  return selection.classIds.length || selection.catechumenIds.length ? "MANUAL" : "AUTO";
}

/** Ordem das celebrações: data, hora, criação (e id, para ser sempre a mesma). */
export function compareCelebrations(a: SacramentCelebration, b: SacramentCelebration): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

const decimal = (value: number) => value.toFixed(1).replace(".", ",");

/**
 * Aproveitamento para o sacramento, avaliado pelo sistema: média ≥ 10,
 * presença ≥ 75% (sem chamadas não penaliza) e todos os requisitos cumpridos.
 * Sem notas lançadas não é apto. `missing` são os requisitos em falta (nomes).
 */
export function sacramentAptitude(facts: {
  average?: number;
  attendanceRate?: number;
  missing: string[];
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { average, attendanceRate, missing } = facts;
  if (average === undefined) reasons.push("Sem notas lançadas");
  else if (average < PASS_GRADE)
    reasons.push(`Média ${decimal(average)} (abaixo de ${PASS_GRADE})`);
  else reasons.push(`Média ${decimal(average)}`);
  if (attendanceRate === undefined) reasons.push("Sem chamadas lançadas");
  else if (attendanceRate < PASS_ATTENDANCE)
    reasons.push(`Presença ${attendanceRate}% (abaixo de ${PASS_ATTENDANCE}%)`);
  else reasons.push(`Presença ${attendanceRate}%`);
  if (missing.length) reasons.push(`Falta: ${missing.join(", ")}`);
  return {
    eligible:
      average !== undefined &&
      average >= PASS_GRADE &&
      (attendanceRate === undefined || attendanceRate >= PASS_ATTENDANCE) &&
      !missing.length,
    reasons,
  };
}

/**
 * Reparte grupos inteiros (as turmas) por `slots` celebrações, equilibrando o
 * número de pessoas: os grupos maiores primeiro, cada um para a celebração com
 * menos gente (no empate, a mais cedo). Sempre o mesmo resultado.
 */
export function distributeGroups<T>(groups: { key: string; items: T[] }[], slots: number): T[][] {
  const buckets: T[][] = Array.from({ length: slots }, () => []);
  if (!slots) return buckets;
  const ordered = [...groups].sort(
    (a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key),
  );
  for (const group of ordered) {
    let target = 0;
    for (let index = 1; index < slots; index++) {
      if (buckets[index].length < buckets[target].length) target = index;
    }
    buckets[target].push(...group.items);
  }
  return buckets;
}

/** Requisito marcado pela coordenação para um candidato. */
export interface RequirementCheck {
  catechumenId: string;
  sacrament: SacramentType;
  requirement: CheckableRequirement;
  met: boolean;
  updatedAt: Date;
  updatedBy: string;
}

export type RequirementSource = "RECORD" | "DOCUMENT" | "MANUAL";

export interface RequirementState {
  requirement: SacramentRequirement;
  met: boolean;
  /** De onde vem: percurso, documento enviado online ou marcação da coordenação. */
  source: RequirementSource;
  /** A coordenação pode marcar/desmarcar. */
  editable: boolean;
}

export interface CandidateFacts {
  baptized: boolean;
  firstCommunion: boolean;
  /** Documentos enviados na matrícula do ano. */
  documents: EnrollmentDocumentKind[];
  checks: Partial<Record<CheckableRequirement, boolean>>;
}

/** O estado de cada requisito de um candidato. */
export function requirementStates(type: SacramentType, facts: CandidateFacts): RequirementState[] {
  return REQUIREMENTS[type].map((requirement) => {
    if (requirement === "BAPTIZED")
      return { requirement, met: facts.baptized, source: "RECORD", editable: false };
    if (requirement === "FIRST_COMMUNION")
      return { requirement, met: facts.firstCommunion, source: "RECORD", editable: false };
    const document = FROM_DOCUMENT[requirement];
    if (document && facts.documents.includes(document))
      return { requirement, met: true, source: "DOCUMENT", editable: false };
    return {
      requirement,
      met: facts.checks[requirement as CheckableRequirement] ?? false,
      source: "MANUAL",
      editable: true,
    };
  });
}

/**
 * Data por omissão do Batismo: a Vigília Pascal (sábado antes da Páscoa) do
 * segundo ano do ano catequético. Algoritmo de Meeus/Jones/Butcher.
 */
export function easterVigil(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const vigil = new Date(Date.UTC(year, month - 1, day - 1));
  return vigil.toISOString().slice(0, 10);
}
