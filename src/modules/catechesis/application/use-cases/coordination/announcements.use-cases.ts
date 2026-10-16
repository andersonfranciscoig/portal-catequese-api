import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type {
  PeopleDirectory,
  PersonSnapshot,
} from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import {
  Announcement,
  AnnouncementAudience,
  type AnnouncementAudience as Audience,
} from "../../../domain/announcement.js";
import {
  AnnouncementNotFoundError,
  AnnouncementRoleError,
} from "../../../domain/errors/catechesis.errors.js";
import type { AnnouncementRepository } from "../../../domain/repositories/catechesis.repositories.js";

const AUDIENCES = Object.values(AnnouncementAudience);

const PORTAL_AUDIENCE = {
  GUARDIAN: AnnouncementAudience.GUARDIANS,
  CATECHUMEN: AnnouncementAudience.CATECHUMENS,
  CATECHIST: AnnouncementAudience.CATECHISTS,
} as const;

export type PortalRole = keyof typeof PORTAL_AUDIENCE;

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Papéis que uma audiência alcança. `ALL` junta os três. */
function rolesOf(audience: Audience): PersonSnapshot["roles"][number][] {
  if (audience === "GUARDIANS") return ["GUARDIAN"];
  if (audience === "CATECHUMENS") return ["CATECHUMEN"];
  if (audience === "CATECHISTS") return ["CATECHIST"];
  return ["GUARDIAN", "CATECHUMEN", "CATECHIST"];
}

/** Catequista por aprovar só entra se a audiência não for só de catequistas e tiver outro papel. */
function receives(person: PersonSnapshot, audience: Audience) {
  if (audience === "CATECHISTS") return person.approvedCatechist;
  if (audience === "GUARDIANS") return person.roles.includes("GUARDIAN");
  if (audience === "CATECHUMENS") return person.roles.includes("CATECHUMEN");
  const family = person.roles.includes("GUARDIAN") || person.roles.includes("CATECHUMEN");
  return family || person.approvedCatechist;
}

async function recipientIds(people: PeopleDirectory, audience: Audience) {
  const list = await people.listByRoles(rolesOf(audience));
  return list.filter((person) => receives(person, audience)).map((person) => person.id);
}

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  pinned: boolean;
  publishedAt: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  recipients: number;
  reads: number;
}

function toPortal(item: Announcement) {
  return {
    id: item.id.value,
    title: item.title,
    body: item.body,
    audience: item.audience,
    pinned: item.pinned,
    publishedAt: item.publishedAt.toISOString(),
    author: item.author,
    createdAt: item.publishedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

const byPinned = (a: Announcement, b: Announcement) =>
  Number(b.pinned) - Number(a.pinned) || b.publishedAt.getTime() - a.publishedAt.getTime();

export class ListAnnouncementsUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute(query: { audience?: Audience | "todos"; search?: string }) {
    const all = (await this.announcements.list()).sort(byPinned);
    const audience = query.audience ?? "todos";
    const term = normalize(query.search?.trim() ?? "");
    const items = all.filter(
      (item) =>
        (audience === "todos" || item.audience === audience) &&
        (!term || normalize(`${item.title} ${item.body}`).includes(term)),
    );
    const reads = await this.announcements.readCounts(items.map((item) => item.id.value));
    const totals = new Map<Audience, number>();
    for (const value of AUDIENCES) totals.set(value, (await recipientIds(this.people, value)).length);
    return {
      items: items.map(
        (item): AnnouncementView => ({
          ...toPortal(item),
          recipients: totals.get(item.audience) ?? 0,
          reads: reads.get(item.id.value) ?? 0,
        }),
      ),
      counts: {
        todos: all.length,
        ALL: all.filter((item) => item.audience === "ALL").length,
        GUARDIANS: all.filter((item) => item.audience === "GUARDIANS").length,
        CATECHUMENS: all.filter((item) => item.audience === "CATECHUMENS").length,
        CATECHISTS: all.filter((item) => item.audience === "CATECHISTS").length,
      },
      audienceCounts: Object.fromEntries(totals) as Record<Audience, number>,
    };
  }
}

export class PublishAnnouncementUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorId: string;
    title: string;
    body: string;
    audience: Audience;
    pinned: boolean;
    notify: boolean;
  }): Promise<AnnouncementView> {
    const item = Announcement.create({ ...input, createdBy: input.actorId, now: this.clock.now() });
    await this.announcements.save(item);
    const ids = await recipientIds(this.people, item.audience);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.announcement_published",
      summary: `Publicou o aviso «${item.title}»`,
    });
    if (input.notify) {
      await this.notifier.notify({
        to: { accountIds: ids },
        kind: "communication.announcement_published",
        title: `Novo aviso: ${item.title}`,
        body: item.body.slice(0, 140),
        link: "/portal/catequese",
        exceptAccountId: input.actorId,
      });
    }
    return { ...toPortal(item), recipients: ids.length, reads: 0 };
  }
}

export class SetAnnouncementPinnedUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: { actorId: string; id: string; pinned: boolean }): Promise<AnnouncementView> {
    const item = await this.announcements.findById(UniqueId.from(input.id));
    if (!item) throw new AnnouncementNotFoundError();
    item.setPinned(input.pinned, this.clock.now());
    await this.announcements.save(item);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.announcement_pinned",
      summary: input.pinned ? `Fixou o aviso «${item.title}»` : `Desafixou o aviso «${item.title}»`,
    });
    const reads = await this.announcements.readCounts([item.id.value]);
    return {
      ...toPortal(item),
      recipients: (await recipientIds(this.people, item.audience)).length,
      reads: reads.get(item.id.value) ?? 0,
    };
  }
}

export class DeleteAnnouncementUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: { actorId: string; id: string }) {
    const item = await this.announcements.findById(UniqueId.from(input.id));
    if (!item) throw new AnnouncementNotFoundError();
    await this.announcements.delete(item.id);
    await this.activity.record({
      actorId: input.actorId,
      category: "SETTINGS",
      action: "catechesis.announcement_deleted",
      summary: `Apagou o aviso «${item.title}»`,
    });
  }
}

/** Avisos do portal para o papel em uso. Cada abertura conta como leitura. */
export class ListMyAnnouncementsUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { accountId: string; roles: readonly string[]; role: PortalRole }) {
    if (!input.roles.includes(input.role)) throw new AnnouncementRoleError();
    const audience = PORTAL_AUDIENCE[input.role];
    const items = (await this.announcements.list())
      .filter((item) => item.audience === "ALL" || item.audience === audience)
      .sort(byPinned);
    await this.announcements.markRead(
      items.map((item) => item.id.value),
      input.accountId,
      this.clock.now(),
    );
    return items.map(toPortal);
  }
}
