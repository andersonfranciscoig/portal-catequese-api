import { ActivityRecorder, type ActivityRecord } from "../application/activity-recorder.js";

/** Guarda a atividade registada para os testes verificarem. */
export class RecordingActivity extends ActivityRecorder {
  readonly entries: ActivityRecord[] = [];

  async record(entry: ActivityRecord): Promise<void> {
    this.entries.push(entry);
  }

  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}
