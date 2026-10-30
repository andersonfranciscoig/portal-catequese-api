import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Mailer } from "../../../../../shared/application/mailer.js";
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
import { centerRef, SEDE_CENTER_ID } from "../../../domain/center.js";
import type {
  AnnouncementRepository,
  CatechistProfileRepository,
  CatechumenRepository,
  CenterRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import {
  assertSameCenter,
  matchesCenter,
  resolveWriteCenter,
  type CenterScope,
} from "../../center-scope.js";

const AUDIENCES = Object.values(AnnouncementAudience);

const PORTAL_AUDIENCE = {
  GUARDIAN: AnnouncementAudience.GUARDIANS,
  CATECHUMEN: AnnouncementAudience.CATECHUMENS,
  CATECHIST: AnnouncementAudience.CATECHISTS,
} as const;

export type PortalRole = keyof typeof PORTAL_AUDIENCE;

/** Onde o portal mostra os avisos (para todos os papéis). */
const PORTAL_LINK = "/portal/catequese";

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Como o destinatário é tratado no email ("Recebeu este aviso como …"). */
const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: "Membro da comunidade da catequese",
  GUARDIANS: "Encarregado de educação",
  CATECHUMENS: "Catequizando",
  CATECHISTS: "Catequista",
};

/** Catequista por aprovar só recebe avisos se tiver outro papel (família). */
function receives(person: PersonSnapshot, audience: Audience) {
  if (audience === "CATECHISTS") return person.approvedCatechist;
  if (audience === "GUARDIANS") return person.roles.includes("GUARDIAN");
  if (audience === "CATECHUMENS") return person.roles.includes("CATECHUMEN");
  const family = person.roles.includes("GUARDIAN") || person.roles.includes("CATECHUMEN");
  return family || person.approvedCatechist;
}

/** Contas ativas que podem receber avisos (uma só consulta para todas as audiências). */
function portalPeople(people: PeopleDirectory) {
  return people.listByRoles(["GUARDIAN", "CATECHUMEN", "CATECHIST"]);
}

function recipientsOf(everyone: PersonSnapshot[], audience: Audience) {
  return everyone.filter((person) => receives(person, audience));
}

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

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
  center: { id: string; name: string };
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
    center: centerRef(item.centerId),
  };
}

const byPinned = (a: Announcement, b: Announcement) =>
  Number(b.pinned) - Number(a.pinned) || b.publishedAt.getTime() - a.publishedAt.getTime();

export class ListAnnouncementsUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute(query: { audience?: Audience | "todos"; search?: string; centerId?: string }) {
    const all = (await this.announcements.list())
      .filter((item) => matchesCenter(item.centerId, query.centerId))
      .sort(byPinned);
    const audience = query.audience ?? "todos";
    const term = normalize(query.search?.trim() ?? "");
    const items = all.filter(
      (item) =>
        (audience === "todos" || item.audience === audience) &&
        (!term || normalize(`${item.title} ${item.body}`).includes(term)),
    );
    const [reads, everyone] = await Promise.all([
      this.announcements.readCounts(items.map((item) => item.id.value)),
      portalPeople(this.people),
    ]);
    const totals = new Map<Audience, number>(
      AUDIENCES.map((value) => [value, recipientsOf(everyone, value).length]),
    );
    return {
      items: items.map((item): AnnouncementView => ({
        ...toPortal(item),
        recipients: totals.get(item.audience) ?? 0,
        reads: reads.get(item.id.value) ?? 0,
      })),
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
    private readonly mailer: Mailer,
    private readonly clock: Clock,
    private readonly centers?: CenterRepository,
  ) {}

  /**
   * Publica o aviso. `notify` avisa no sino; `email` envia o aviso completo por
   * email a quem tem email (a quem publica, nunca).
   */
  async execute(input: {
    actorId: string;
    title: string;
    body: string;
    audience: Audience;
    pinned: boolean;
    notify: boolean;
    email: boolean;
    centerId?: string;
    scope?: CenterScope;
  }): Promise<AnnouncementView> {
    const centerId = await resolveWriteCenter(this.centers, input.scope, input.centerId);
    const item = Announcement.create({
      ...input,
      centerId,
      createdBy: input.actorId,
      now: this.clock.now(),
    });
    await this.announcements.save(item);
    const recipients = recipientsOf(await portalPeople(this.people), item.audience);
    const others = recipients.filter((person) => person.id !== input.actorId);

    if (input.notify) {
      // O email (quando pedido) segue à parte, com o aviso completo.
      await this.notifier.notify({
        to: { accountIds: recipients.map((person) => person.id) },
        kind: "communication.announcement_published",
        title: `Novo aviso: ${item.title}`,
        body: item.body.length > 140 ? `${item.body.slice(0, 139)}…` : item.body,
        link: PORTAL_LINK,
        exceptAccountId: input.actorId,
        email: false,
      });
    }
    const emailed = input.email ? others.filter((person) => person.email) : [];
    for (const person of emailed) {
      this.mailer.sendAnnouncement({
        email: person.email!,
        firstName: firstName(person.fullName),
        title: item.title,
        body: item.body,
        audienceLabel: AUDIENCE_LABEL[item.audience],
        publishedAt: item.publishedAt,
        link: PORTAL_LINK,
      });
    }

    const channels = [
      input.notify && "no sino",
      emailed.length &&
        `por email a ${emailed.length} ${emailed.length === 1 ? "pessoa" : "pessoas"}`,
    ].filter(Boolean);
    await this.activity.record({
      actorId: input.actorId,
      category: "COMMUNICATION",
      action: "communication.announcement_published",
      summary: `Publicou o aviso «${item.title}»${channels.length ? ` (avisou ${channels.join(" e ")})` : ""}`,
    });
    return { ...toPortal(item), recipients: recipients.length, reads: 0 };
  }
}

export class SetAnnouncementPinnedUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorId: string;
    id: string;
    pinned: boolean;
    scope?: CenterScope;
  }): Promise<AnnouncementView> {
    const item = await this.announcements.findById(UniqueId.from(input.id));
    if (!item) throw new AnnouncementNotFoundError();
    assertSameCenter(input.scope, item.centerId);
    item.setPinned(input.pinned, this.clock.now());
    await this.announcements.save(item);
    await this.activity.record({
      actorId: input.actorId,
      category: "COMMUNICATION",
      action: "communication.announcement_pinned",
      summary: input.pinned ? `Fixou o aviso «${item.title}»` : `Desafixou o aviso «${item.title}»`,
    });
    const reads = await this.announcements.readCounts([item.id.value]);
    return {
      ...toPortal(item),
      recipients: recipientsOf(await portalPeople(this.people), item.audience).length,
      reads: reads.get(item.id.value) ?? 0,
    };
  }
}

export class DeleteAnnouncementUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: { actorId: string; id: string; scope?: CenterScope }) {
    const item = await this.announcements.findById(UniqueId.from(input.id));
    if (!item) throw new AnnouncementNotFoundError();
    assertSameCenter(input.scope, item.centerId);
    await this.announcements.delete(item.id);
    await this.activity.record({
      actorId: input.actorId,
      category: "COMMUNICATION",
      action: "communication.announcement_deleted",
      summary: `Apagou o aviso «${item.title}»`,
    });
  }
}

/** Avisos do portal para o papel em uso. Cada abertura conta como leitura. */
export class ListMyAnnouncementsUseCase {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly clock: Clock,
    private readonly catechumens?: CatechumenRepository,
    private readonly profiles?: CatechistProfileRepository,
  ) {}

  async execute(input: { accountId: string; roles: readonly string[]; role: PortalRole }) {
    if (!input.roles.includes(input.role)) throw new AnnouncementRoleError();
    const audience = PORTAL_AUDIENCE[input.role];
    const allowed = await this.linkedCenters(input.accountId);
    const items = (await this.announcements.list())
      .filter((item) => item.audience === "ALL" || item.audience === audience)
      .filter((item) => !allowed || allowed.has(item.centerId ?? SEDE_CENTER_ID))
      .sort(byPinned);
    await this.announcements.markRead(
      items.map((item) => item.id.value),
      input.accountId,
      this.clock.now(),
    );
    return items.map(toPortal);
  }

  /** Centros dos catequizandos e, se for catequista, do perfil. Sem ligações, o Centro Sede. */
  private async linkedCenters(accountId: string): Promise<Set<string> | null> {
    if (!this.catechumens || !this.profiles) return null;
    const [catechumens, profile] = await Promise.all([
      this.catechumens.findAccessibleBy(accountId),
      this.profiles.find(accountId),
    ]);
    const ids = [
      ...catechumens.map((item) => item.centerId),
      ...(profile ? [profile.centerId] : []),
    ];
    return new Set(ids.length ? ids : [SEDE_CENTER_ID]);
  }
}
