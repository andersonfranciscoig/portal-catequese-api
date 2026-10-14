import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import { CalendarNotDefinedError } from "../../../domain/errors/catechesis.errors.js";
import type { CalendarRepository } from "../../../domain/repositories/catechesis.repositories.js";
import { toCalendarView, type CalendarView } from "../../views.js";

export class GetCalendarUseCase {
  constructor(private readonly calendars: CalendarRepository) {}

  async execute(): Promise<CalendarView> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    return toCalendarView(calendar);
  }
}

export interface SetCalendarInput {
  actorId: string;
  label: string;
  startsOn: string;
  endsOn: string;
}

/** A coordenação define o ano catequético em curso e as datas da catequese. */
export class SetCalendarUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, ...dates }: SetCalendarInput): Promise<CalendarView> {
    const now = this.clock.now();
    const current = await this.calendars.get();
    const calendar = current ?? CatecheticalCalendar.define({ ...dates, updatedBy: actorId }, now);
    if (current) current.change(dates, actorId, now);
    await this.calendars.save(calendar);
    await this.activity.record({
      actorId,
      category: "SETTINGS",
      action: "catechesis.calendar_changed",
      summary: `Definiu o ano catequético ${dates.label} (${dates.startsOn} a ${dates.endsOn})`,
    });
    return toCalendarView(calendar);
  }
}
