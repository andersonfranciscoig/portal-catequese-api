import type { CatechesisLevel } from "./catechesis.js";
import type { EnrollmentDocumentKind } from "./enrollment-document.js";

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

/** Data e local da celebração num ano catequético. */
export interface SacramentCelebration {
  catecheticalYear: string;
  type: SacramentType;
  /** YYYY-MM-DD */
  date: string;
  place: string;
  updatedAt: Date;
  updatedBy?: string;
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
