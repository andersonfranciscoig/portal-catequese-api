import type { ActivityCategory } from "../../../../shared/application/activity-recorder.js";
import type { ActivityEntry } from "../activity-entry.js";

export interface ActivityQuery {
  actorId?: string;
  /** Ações feitas por OU sobre esta conta. */
  involvingAccountId?: string;
  category?: ActivityCategory;
  /** Procura no texto e no código da ação. */
  search?: string;
  /** Só antes desta data (paginação por cursor). */
  before?: Date;
  limit: number;
}

export abstract class ActivityRepository {
  abstract save(entry: ActivityEntry): Promise<void>;
  /** Mais recentes primeiro. */
  abstract list(query: ActivityQuery): Promise<ActivityEntry[]>;
}
