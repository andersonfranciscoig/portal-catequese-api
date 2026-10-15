import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { AttendanceStatus, SessionSlot } from "../../../domain/catechesis.js";
import { luandaToday } from "../../../domain/dates.js";
import {
  CalendarNotDefinedError,
  ClassNotFoundError,
  InvalidSessionDateError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechistPresenceRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { classLabel } from "../../messages.js";
import { toClassViews } from "../../views.js";
import type { CoordinationClassView } from "./class.use-cases.js";

const SLOTS: SessionSlot[] = ["SATURDAY_MORNING", "SATURDAY_AFTERNOON", "SUNDAY_AFTER_MASS"];

/** Dias com encontros já realizados no ano (mais recentes primeiro), com os períodos. */
export class ListSessionDaysUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ date: string; slots: SessionSlot[] }[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const today = luandaToday(this.clock.now());
    const days = new Map<string, SessionSlot[]>();
    for (const slot of SLOTS) {
      for (const date of calendar.sessionDates(slot, today)) {
        days.set(date, [...(days.get(date) ?? []), slot]);
      }
    }
    return [...days.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, slots]) => ({ date, slots }));
  }
}

export interface SessionClassView {
  class: CoordinationClassView;
  catechistPresence: AttendanceStatus | null;
  rollMarked: boolean;
  present: number;
  total: number;
}

/** Um dia de encontros: cada turma, a chamada e a presença do catequista. */
export class GetSessionUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly attendance: AttendanceRepository,
    private readonly presence: CatechistPresenceRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({ date }: { date: string }): Promise<SessionClassView[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const classes = (await this.classes.listByYear(calendar.label)).filter((klass) =>
      calendar.isSessionDate(klass.slot, date),
    );
    const [views, presence] = await Promise.all([
      toClassViews(classes, this.people, calendar, luandaToday(this.clock.now())),
      this.presence.listForDate(date),
    ]);
    return Promise.all(
      classes.map(async (klass, index) => {
        const [members, sheets] = await Promise.all([
          this.enrollments.countConfirmedInClass(klass.id.value),
          this.attendance.listForClass(klass.id.value),
        ]);
        const sheet = sheets.find((item) => item.date === date);
        return {
          class: { ...views[index], members },
          catechistPresence:
            presence.find((item) => item.classId === klass.id.value)?.status ?? null,
          rollMarked: Boolean(sheet),
          present: sheet?.marks.filter((mark) => mark.status === "PRESENT").length ?? 0,
          total: sheet?.marks.length ?? members,
        };
      }),
    );
  }
}

/** A coordenação regista se o catequista esteve no encontro. */
export class SetCatechistPresenceUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly presence: CatechistPresenceRepository,
    private readonly calendars: CalendarRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({
    actorId,
    classId,
    date,
    status,
  }: {
    actorId: string;
    classId: string;
    date: string;
    status: AttendanceStatus;
  }): Promise<void> {
    const klass = await this.classes.findById(UniqueId.from(classId));
    if (!klass) throw new ClassNotFoundError();
    const calendar = await this.calendars.get();
    const now = this.clock.now();
    if (!calendar?.isSessionDate(klass.slot, date) || date > luandaToday(now)) {
      throw new InvalidSessionDateError("Este dia não é um encontro já realizado desta turma.");
    }
    await this.presence.save({ classId, date, status, recordedBy: actorId, recordedAt: now });
    await this.activity.record({
      actorId,
      category: "CATECHISTS",
      action: "catechesis.catechist_presence",
      summary: `Registou a presença do catequista de ${classLabel(klass)} a ${date.split("-").reverse().join("/")}`,
    });
  }
}
