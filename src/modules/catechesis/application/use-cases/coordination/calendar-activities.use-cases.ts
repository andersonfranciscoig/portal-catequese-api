import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import {
  CalendarActivity,
  type CalendarActivityAudience,
  type CalendarActivityKind,
} from "../../../domain/calendar-activity.js";
import { luandaToday } from "../../../domain/dates.js";
import {
  AnnouncementRoleError,
  CalendarActivityNotFoundError,
  CalendarNotDefinedError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarActivityRepository,
  CalendarRepository,
  SacramentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { easterVigil, SACRAMENT_TYPES, type SacramentType } from "../../../domain/sacraments.js";
import { PARISH_CHURCH } from "./sacraments.use-cases.js";

const SACRAMENT_LABEL: Record<SacramentType, string> = {
  BAPTISM: "Batismo",
  FIRST_COMMUNION: "Primeira Comunhão",
  CONFIRMATION: "Crisma",
};

export interface CalendarActivityView {
  id: string;
  title: string;
  description: string;
  kind: CalendarActivityKind;
  audience: CalendarActivityAudience;
  startsOn: string;
  endsOn?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalCalendarEvent {
  id: string;
  title: string;
  description: string;
  kind: CalendarActivityKind | "SACRAMENT";
  startsAt: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PortalRole = "GUARDIAN" | "CATECHUMEN" | "CATECHIST";

const AUDIENCE_OF: Record<Exclude<PortalRole, "CATECHUMEN">, CalendarActivityAudience> = {
  GUARDIAN: "GUARDIANS",
  CATECHIST: "CATECHISTS",
};

function toView(item: CalendarActivity): CalendarActivityView {
  return {
    id: item.id.value,
    title: item.title,
    description: item.description,
    kind: item.kind,
    audience: item.audience,
    startsOn: item.startsOn,
    endsOn: item.endsOn,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export class ListCalendarActivitiesUseCase {
  constructor(private readonly activities: CalendarActivityRepository) {}

  async execute(): Promise<CalendarActivityView[]> {
    const items = await this.activities.list();
    return items.sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map(toView);
  }
}

export class SaveCalendarActivityUseCase {
  constructor(
    private readonly activities: CalendarActivityRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorId: string;
    id?: string;
    title: string;
    description: string;
    kind: CalendarActivityKind;
    audience: CalendarActivityAudience;
    startsOn: string;
    endsOn?: string;
  }): Promise<CalendarActivityView> {
    const now = this.clock.now();
    if (!input.id) {
      const created = CalendarActivity.create({ ...input, createdBy: input.actorId, now });
      await this.activities.save(created);
      await this.activity.record({
        actorId: input.actorId,
        category: "SETTINGS",
        action: "catechesis.activity_created",
        summary: `Agendou «${created.title}» (${created.startsOn})`,
      });
      return toView(created);
    }
    const current = await this.activities.findById(UniqueId.from(input.id));
    if (!current) throw new CalendarActivityNotFoundError();
    current.change(input, now);
    await this.activities.save(current);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.activity_changed",
      summary: `Alterou a atividade «${current.title}»`,
    });
    return toView(current);
  }
}

export class DeleteCalendarActivityUseCase {
  constructor(
    private readonly activities: CalendarActivityRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: { actorId: string; id: string }) {
    const current = await this.activities.findById(UniqueId.from(input.id));
    if (!current) throw new CalendarActivityNotFoundError();
    await this.activities.delete(current.id);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.activity_deleted",
      summary: `Retirou a atividade «${current.title}» do calendário`,
    });
  }
}

/** Calendário do portal: sacramentos do ano e atividades visíveis para o papel. */
export class ListPortalCalendarUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly sacraments: SacramentRepository,
    private readonly activities: CalendarActivityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    roles: readonly string[];
    role: PortalRole;
  }): Promise<PortalCalendarEvent[]> {
    if (!input.roles.includes(input.role)) throw new AnnouncementRoleError();
    const own = input.role === "CATECHUMEN" ? undefined : AUDIENCE_OF[input.role];
    return this.collect(own);
  }

  /** Portal público: sacramentos e atividades para todos (sem as de um só papel). */
  async listShared(): Promise<PortalCalendarEvent[]> {
    return this.collect(undefined);
  }

  private async collect(own: CalendarActivityAudience | undefined): Promise<PortalCalendarEvent[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const today = luandaToday(this.clock.now());
    const saved = await this.sacraments.listCelebrations(calendar.label);
    const year = Number(calendar.label.slice(5, 9));
    const sacraments: PortalCalendarEvent[] = SACRAMENT_TYPES.flatMap((type) => {
      const celebration = saved.find((item) => item.type === type);
      const startsAt = celebration?.date ?? (type === "BAPTISM" ? easterVigil(year) : undefined);
      if (!startsAt || startsAt < today) return [];
      const at = (celebration?.updatedAt ?? calendar.updatedAt).toISOString();
      return [
        {
          id: `sacrament:${type}`,
          title: SACRAMENT_LABEL[type],
          description: celebration?.place ?? PARISH_CHURCH,
          kind: "SACRAMENT" as const,
          startsAt,
          createdAt: at,
          updatedAt: at,
        },
      ];
    });
    const activities = (await this.activities.list()).flatMap((item) => {
      const end = item.endsOn ?? item.startsOn;
      if (end < today) return [];
      if (item.audience !== "ALL" && item.audience !== own) return [];
      return [
        {
          id: item.id.value,
          title: item.title,
          description: item.description,
          kind: item.kind,
          startsAt: item.startsOn,
          endsAt: item.endsOn,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        },
      ];
    });
    return [...sacraments, ...activities].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
}
