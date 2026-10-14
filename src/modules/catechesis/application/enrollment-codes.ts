import { randomInt } from "node:crypto";

import type { EnrollmentRepository } from "../domain/repositories/catechesis.repositories.js";

/**
 * Códigos de matrícula (CRP-2026-48213): servem para acompanhar a matrícula sem
 * conta, por isso são aleatórios (não sequenciais) e únicos.
 */
export class EnrollmentCodes {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly random: (max: number) => number = (max) => randomInt(max),
  ) {}

  async next(year: number): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = `CRP-${year}-${String(this.random(100_000)).padStart(5, "0")}`;
      if (!(await this.enrollments.codeExists(code))) return code;
    }
    throw new Error("Não foi possível gerar um código de matrícula único.");
  }
}
