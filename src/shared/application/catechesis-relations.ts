/**
 * Como outra conta se relaciona com quem pergunta, no ano catequético em curso:
 * - CATECHIST_OF_MY_CATECHUMEN: catequista da turma de um educando meu (sou encarregado)
 * - GUARDIAN_IN_MY_CLASS: encarregado de um catequizando da minha turma (sou catequista)
 * - CATECHUMEN_IN_MY_CLASS: catequizando da minha turma com conta própria (sou catequista)
 * - MY_CATECHIST: catequista da minha turma (sou catequizando com conta)
 */
export type CatechesisRelationKind =
  "CATECHIST_OF_MY_CATECHUMEN" | "GUARDIAN_IN_MY_CLASS" | "CATECHUMEN_IN_MY_CLASS" | "MY_CATECHIST";

export interface CatechesisRelation {
  /** A outra conta. */
  accountId: string;
  kind: CatechesisRelationKind;
  /** Catequizando que liga as duas contas. */
  catechumenName: string;
  /** YYYY-MM-DD */
  catechumenBirthDate: string;
  /** "Comunhão · 3.º ano" */
  classLabel: string;
}

/**
 * Relações da catequese entre contas (turmas, encarregados, catequistas).
 * Contrato partilhado: o módulo `catechesis` implementa-o.
 */
export abstract class CatechesisRelations {
  /** Relações da conta no ano em curso (matrículas confirmadas com turma). */
  abstract relationsOf(accountId: string): Promise<CatechesisRelation[]>;
}
