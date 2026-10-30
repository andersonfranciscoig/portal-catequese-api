import type { CatechesisRelations } from "../../../../shared/application/catechesis-relations.js";
import type { ContactDirectory } from "../../../../shared/application/contact-directory.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import {
  COORDINATION_TEAM_NAME,
  allowedRelations,
  chatRoleOf,
  isStaff,
  luandaToday,
  relationContext,
  relationRole,
  type ChatPerson,
  type ChatRelation,
} from "../../domain/chat-policy.js";
import type { ChatAccess } from "../chat-access.js";
import type { ContactView } from "../views.js";

export const CONTACTS_LIMIT = 50;

/** Minúsculas e sem acentos, para pesquisar nomes. */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const ROLE_LABEL: Record<string, string> = {
  GUARDIAN: "Encarregado",
  CATECHIST: "Catequista",
  CATECHUMEN: "Catequizando",
};

/** "Coordenação", "Administração" ou os papéis da conta ("Encarregado · Catequista"). */
function describe(person: ChatPerson): string | null {
  if (person.staff === "ADMIN") return "Administração";
  if (person.staff === "COORDINATION") return "Coordenação";
  const roles = person.roles.map((role) => ROLE_LABEL[role]).filter(Boolean);
  return roles.length ? roles.join(" · ") : null;
}

/**
 * Pessoas com quem quem pede pode iniciar uma conversa (segundo a matriz de
 * permissões). A equipa da coordenação pesquisa em todas as contas ativas.
 */
export class ListContactsUseCase {
  constructor(
    private readonly access: ChatAccess,
    private readonly directory: ContactDirectory,
    private readonly relations: CatechesisRelations,
    private readonly clock: Clock,
  ) {}

  async execute(input: { accountId: string; search?: string }): Promise<{ items: ContactView[] }> {
    const viewer = await this.access.viewer(input.accountId);
    const search = input.search?.trim() ? input.search.trim().slice(0, 100) : undefined;

    if (isStaff(viewer)) {
      const found = await this.directory.search(search, CONTACTS_LIMIT + 1);
      return {
        items: found
          .filter((person) => person.id !== viewer.id && person.active)
          .slice(0, CONTACTS_LIMIT)
          .map((person) => ({
            kind: "account",
            accountId: person.id,
            name: person.fullName,
            role: chatRoleOf(person),
            context: describe(person),
          })),
      };
    }

    const today = luandaToday(this.clock.now());
    const allowed = allowedRelations(await this.relations.relationsOf(viewer.id), today);
    const byAccount = new Map<string, ChatRelation[]>();
    for (const relation of allowed) {
      byAccount.set(relation.accountId, [...(byAccount.get(relation.accountId) ?? []), relation]);
    }
    const people = await this.directory.findMany([...byAccount.keys()]);
    const term = search ? normalize(search) : "";

    const contacts: ContactView[] = people
      .filter((person) => person.active && person.id !== viewer.id)
      .filter((person) => !term || normalize(person.fullName).includes(term))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"))
      .map((person) => {
        const relations = byAccount.get(person.id)!;
        return {
          kind: "account",
          accountId: person.id,
          name: person.fullName,
          role: relationRole(relations[0]),
          context: [...new Set(relations.map(relationContext))].join("; "),
        };
      });

    const coordination: ContactView = {
      kind: "coordination",
      accountId: null,
      name: COORDINATION_TEAM_NAME,
      role: null,
      context: null,
    };
    const showCoordination = !term || normalize(COORDINATION_TEAM_NAME).includes(term);
    return {
      items: [...(showCoordination ? [coordination] : []), ...contacts].slice(0, CONTACTS_LIMIT),
    };
  }
}
