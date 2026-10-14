import {
  ActivityRecorder,
  type ActivityRecord,
} from "../../../shared/application/activity-recorder.js";
import type { Clock } from "../../../shared/domain/clock.js";
import { ActivityEntry } from "../domain/activity-entry.js";
import type { ActivityRepository } from "../domain/repositories/activity.repository.js";

export class AuditActivityRecorder extends ActivityRecorder {
  constructor(
    private readonly entries: ActivityRepository,
    private readonly clock: Clock,
  ) {
    super();
  }

  async record(record: ActivityRecord): Promise<void> {
    await this.entries.save(ActivityEntry.record(record, this.clock.now()));
  }
}
