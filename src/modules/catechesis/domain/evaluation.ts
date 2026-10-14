import type { YearOutcome } from "./catechesis.js";
import { InvalidEvaluationError } from "./errors/catechesis.errors.js";

export const TERMS = ["T1", "T2", "T3"] as const;
export type Term = (typeof TERMS)[number];

/** Escala de 0 a 20 (como no ensino em Angola). */
export const GRADE_MAX = 20;
export const PASS_GRADE = 10;
/** Presença mínima recomendada para transitar. */
export const PASS_ATTENDANCE = 75;

export type Grades = Partial<Record<Term, number>>;

/** Avaliação de um catequizando na sua turma (value object). */
export interface Evaluation {
  classId: string;
  catechumenId: string;
  grades: Grades;
  /** Decisão final do catequista. */
  outcome?: YearOutcome;
  updatedBy: string;
  updatedAt: Date;
}

/** Notas de 0 a 20, com uma casa decimal no máximo. */
export function validateGrades(grades: Grades): Grades {
  const clean: Grades = {};
  for (const term of TERMS) {
    const value = grades[term];
    if (value === undefined || value === null) continue;
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > GRADE_MAX ||
      Math.round(value * 10) !== value * 10
    ) {
      throw new InvalidEvaluationError("As notas vão de 0 a 20, com uma casa decimal no máximo.");
    }
    clean[term] = value;
  }
  return clean;
}

export function averageGrade(grades: Grades): number | undefined {
  const values = TERMS.map((term) => grades[term]).filter(
    (value): value is number => value !== undefined,
  );
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : undefined;
}

/** Sugestão: transita com média ≥ 10 e presença ≥ 75%. */
export function suggestOutcome(average?: number, attendanceRate?: number): YearOutcome | undefined {
  if (average === undefined) return undefined;
  return average >= PASS_GRADE &&
    (attendanceRate === undefined || attendanceRate >= PASS_ATTENDANCE)
    ? "PASSED"
    : "REPEAT";
}
