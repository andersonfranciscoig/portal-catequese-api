/** Papel mostrado nas mensagens. */
export type ChatRole = "GUARDIAN" | "CATECHIST" | "CATECHUMEN" | "COORDINATION" | "ADMIN";

/** Nome da equipa da coordenação nas conversas. */
export const COORDINATION_TEAM_NAME = "Coordenação da catequese";

/** Uma conta vista pelas mensagens. */
export interface ChatPerson {
  id: string;
  fullName: string;
  roles: readonly ("GUARDIAN" | "CATECHUMEN" | "CATECHIST")[];
  staff: "ADMIN" | "COORDINATION" | null;
  active: boolean;
}

/** Relação da catequese entre quem pergunta e outra conta (ano em curso). */
export interface ChatRelation {
  accountId: string;
  kind:
    | "CATECHIST_OF_MY_CATECHUMEN"
    | "GUARDIAN_IN_MY_CLASS"
    | "CATECHUMEN_IN_MY_CLASS"
    | "MY_CATECHIST";
  catechumenName: string;
  /** YYYY-MM-DD */
  catechumenBirthDate: string;
  classLabel: string;
}

export const ADULT_AGE = 18;

/** Anos completos em `today` (datas YYYY-MM-DD). */
export function ageAt(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ay, am, ad] = today.split("-").map(Number);
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
}

/** O dia de hoje em Luanda (UTC+1, sem hora de verão). */
export function luandaToday(now: Date): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isStaff(person: Pick<ChatPerson, "staff">): boolean {
  return person.staff !== null;
}

/** Papel principal de uma conta (equipa primeiro; depois catequista, encarregado, catequizando). */
export function chatRoleOf(person: Pick<ChatPerson, "staff" | "roles">): ChatRole {
  if (person.staff) return person.staff;
  for (const role of ["CATECHIST", "GUARDIAN", "CATECHUMEN"] as const) {
    if (person.roles.includes(role)) return role;
  }
  return "GUARDIAN";
}

/** Papel da outra conta nesta relação. */
export function relationRole(relation: Pick<ChatRelation, "kind">): ChatRole {
  switch (relation.kind) {
    case "CATECHIST_OF_MY_CATECHUMEN":
    case "MY_CATECHIST":
      return "CATECHIST";
    case "GUARDIAN_IN_MY_CLASS":
      return "GUARDIAN";
    case "CATECHUMEN_IN_MY_CLASS":
      return "CATECHUMEN";
  }
}

/** "Catequista de Ana Francisco · Comunhão · 3.º ano" */
export function relationContext(relation: ChatRelation): string {
  switch (relation.kind) {
    case "CATECHIST_OF_MY_CATECHUMEN":
      return `Catequista de ${relation.catechumenName} · ${relation.classLabel}`;
    case "MY_CATECHIST":
      return `Catequista · ${relation.classLabel}`;
    case "GUARDIAN_IN_MY_CLASS":
      return `Encarregado de ${relation.catechumenName} · ${relation.classLabel}`;
    case "CATECHUMEN_IN_MY_CLASS":
      return `Catequizando · ${relation.classLabel}`;
  }
}

/**
 * Relações que permitem iniciar uma conversa: um catequista só fala
 * diretamente com catequizandos adultos (18+ hoje) com conta; os menores
 * ficam com o encarregado.
 */
export function allowedRelations(relations: ChatRelation[], today: string): ChatRelation[] {
  return relations.filter(
    (relation) =>
      relation.kind !== "CATECHUMEN_IN_MY_CLASS" ||
      ageAt(relation.catechumenBirthDate, today) >= ADULT_AGE,
  );
}

export type ChatTarget = { kind: "coordination" } | { kind: "account"; person: ChatPerson };

export type StartDecision =
  | { allowed: false }
  | { allowed: true; kind: "DIRECT"; otherId: string }
  | { allowed: true; kind: "COORDINATION"; subjectId: string };

/**
 * Quem pode iniciar uma conversa com quem (matriz de permissões):
 * - encarregado → coordenação; catequistas das turmas dos seus educandos
 * - catequista → coordenação; encarregados e catequizandos adultos (com conta) da sua turma
 * - catequizando com conta → coordenação; catequistas da sua turma
 * - coordenação e administração → qualquer conta ativa. Com uma conta fora da
 *   equipa, a conversa é a dessa conta com a coordenação; entre a equipa, direta.
 *
 * `relations` são as relações de `viewer` no ano em curso.
 */
export function decideStart(
  viewer: ChatPerson,
  target: ChatTarget,
  relations: ChatRelation[],
  today: string,
): StartDecision {
  const deny = { allowed: false } as const;
  if (!viewer.active) return deny;

  if (target.kind === "coordination") {
    // A equipa já é a coordenação: fala diretamente com quem quiser.
    return isStaff(viewer) ? deny : { allowed: true, kind: "COORDINATION", subjectId: viewer.id };
  }

  const { person } = target;
  if (person.id === viewer.id || !person.active) return deny;

  if (isStaff(viewer)) {
    return isStaff(person)
      ? { allowed: true, kind: "DIRECT", otherId: person.id }
      : { allowed: true, kind: "COORDINATION", subjectId: person.id };
  }

  const related = allowedRelations(relations, today).some(
    (relation) => relation.accountId === person.id,
  );
  return related ? { allowed: true, kind: "DIRECT", otherId: person.id } : deny;
}
