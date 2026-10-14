import { Entity } from "../../../shared/domain/entity.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import type {
  ActivityCategory,
  ActivityRecord,
} from "../../../shared/application/activity-recorder.js";

export interface ActivityEntryProps {
  actorId?: string;
  category: ActivityCategory;
  action: string;
  summary: string;
  targetAccountId?: string;
  at: Date;
}

/** Uma ação registada (imutável depois de criada). */
export class ActivityEntry extends Entity<ActivityEntryProps> {
  static record(record: ActivityRecord, at: Date): ActivityEntry {
    return new ActivityEntry({ ...record, summary: record.summary.slice(0, 500), at });
  }

  static restore(props: ActivityEntryProps, id: UniqueId): ActivityEntry {
    return new ActivityEntry({ ...props }, id);
  }

  get actorId() {
    return this.props.actorId;
  }
  get category() {
    return this.props.category;
  }
  get action() {
    return this.props.action;
  }
  get summary() {
    return this.props.summary;
  }
  get targetAccountId() {
    return this.props.targetAccountId;
  }
  get at() {
    return this.props.at;
  }
}
