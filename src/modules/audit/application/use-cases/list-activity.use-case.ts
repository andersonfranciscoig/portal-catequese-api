import type { UseCase } from "../../../../shared/application/use-case.js";
import type {
  ActivityQuery,
  ActivityRepository,
} from "../../domain/repositories/activity.repository.js";
import type { AccountDirectory } from "../ports/account-directory.js";

export interface ActivityView {
  id: string;
  at: string;
  actorId?: string;
  actorName?: string;
  category: string;
  action: string;
  summary: string;
  targetAccountId?: string;
  targetName?: string;
}

/** Registo de atividade (mais recente primeiro), com os nomes das contas. */
export class ListActivityUseCase implements UseCase<ActivityQuery, ActivityView[]> {
  constructor(
    private readonly entries: ActivityRepository,
    private readonly directory: AccountDirectory,
  ) {}

  async execute(query: ActivityQuery): Promise<ActivityView[]> {
    const entries = await this.entries.list(query);
    const ids = [
      ...new Set(
        entries.flatMap((entry) => [entry.actorId, entry.targetAccountId]).filter(Boolean),
      ),
    ] as string[];
    const names = ids.length ? await this.directory.namesFor(ids) : {};
    return entries.map((entry) => ({
      id: entry.id.value,
      at: entry.at.toISOString(),
      actorId: entry.actorId,
      actorName: entry.actorId ? names[entry.actorId] : undefined,
      category: entry.category,
      action: entry.action,
      summary: entry.summary,
      targetAccountId: entry.targetAccountId,
      targetName: entry.targetAccountId ? names[entry.targetAccountId] : undefined,
    }));
  }
}
