import type { ActivityEntry } from "../../domain/activity-entry.js";
import {
  ActivityRepository,
  type ActivityQuery,
} from "../../domain/repositories/activity.repository.js";

export class InMemoryActivityRepository extends ActivityRepository {
  readonly items: ActivityEntry[] = [];

  async save(entry: ActivityEntry) {
    this.items.push(entry);
  }

  async list(query: ActivityQuery) {
    const search = query.search?.toLowerCase();
    return this.items
      .filter(
        (entry) =>
          (!query.actorId || entry.actorId === query.actorId) &&
          (!query.involvingAccountId ||
            entry.actorId === query.involvingAccountId ||
            entry.targetAccountId === query.involvingAccountId) &&
          (!query.category || entry.category === query.category) &&
          (!query.before || entry.at < query.before) &&
          (!search || `${entry.summary} ${entry.action}`.toLowerCase().includes(search)),
      )
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, query.limit);
  }
}
