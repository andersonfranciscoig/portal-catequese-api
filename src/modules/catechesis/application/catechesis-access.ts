import type {
  PeopleDirectory,
  PersonSnapshot,
} from "../../../shared/application/people-directory.js";
import {
  NotAnApplicantError,
  NotAnApprovedCatechistError,
} from "../domain/errors/catechesis.errors.js";

/** Quem pode fazer o quê na catequese, a partir dos papéis da conta (módulo de identidade). */
export class CatechesisAccess {
  constructor(private readonly people: PeopleDirectory) {}

  /** Encarregado (inscreve educandos) ou adulto (inscreve-se a si). */
  async applicant(accountId: string): Promise<PersonSnapshot> {
    const person = await this.people.find(accountId);
    if (
      !person?.active ||
      !(person.roles.includes("GUARDIAN") || person.roles.includes("CATECHUMEN"))
    ) {
      throw new NotAnApplicantError();
    }
    return person;
  }

  /** Catequista aprovado pela coordenação. */
  async catechist(accountId: string): Promise<PersonSnapshot> {
    const person = await this.people.find(accountId);
    if (!person?.active || !person.approvedCatechist) throw new NotAnApprovedCatechistError();
    return person;
  }
}
