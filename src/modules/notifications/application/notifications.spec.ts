import { beforeEach, describe, expect, it } from "vitest";

import { PeopleDirectory } from "../../../shared/application/people-directory.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import { NotificationNotFoundError } from "../domain/errors.js";
import { InMemoryNotificationRepository } from "../infrastructure/persistence/in-memory-notification.repository.js";
import { DeliverNotificationUseCase } from "./use-cases/deliver-notification.use-case.js";
import {
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from "./use-cases/my-notifications.use-cases.js";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const COORDINATOR = "00000000-0000-4000-8000-000000000002";
const GUARDIAN = "00000000-0000-4000-8000-000000000003";

class Directory extends PeopleDirectory {
  async find() {
    return null;
  }
  async findMany() {
    return [];
  }
  async listCatechists() {
    return [];
  }
  async idsWithPermission(permission: string) {
    return permission === "SUPER_ADMIN" ? [ADMIN] : [ADMIN, COORDINATOR];
  }
}

describe("Notificações", () => {
  let repo: InMemoryNotificationRepository;
  let clock: FixedClock;
  let deliver: DeliverNotificationUseCase;
  let list: ListMyNotificationsUseCase;

  beforeEach(() => {
    repo = new InMemoryNotificationRepository();
    clock = new FixedClock();
    deliver = new DeliverNotificationUseCase(repo, new Directory(), clock);
    list = new ListMyNotificationsUseCase(repo);
  });

  it("entrega a quem tem a permissão, sem repetir e sem quem fez a ação", async () => {
    const sent = await deliver.execute({
      to: { permission: "COORDINATION" },
      kind: "catechesis.enrollment_submitted",
      title: "Nova matrícula para analisar",
      exceptAccountId: ADMIN,
    });
    expect(sent).toBe(1);
    expect((await list.execute({ accountId: COORDINATOR })).unread).toBe(1);
    expect((await list.execute({ accountId: ADMIN })).unread).toBe(0);

    expect(
      await deliver.execute({
        to: { accountIds: [GUARDIAN, GUARDIAN, ""] },
        kind: "x",
        title: "Olá",
      }),
    ).toBe(1);
    expect(await deliver.execute({ to: { accountIds: [] }, kind: "x", title: "Olá" })).toBe(0);
  });

  it("só aceita ligações internas do portal", async () => {
    for (const link of ["/portal", "https://exemplo.com", "//exemplo.com"]) {
      await deliver.execute({ to: { accountIds: [GUARDIAN] }, kind: "x", title: link, link });
    }
    const { items } = await list.execute({ accountId: GUARDIAN });
    expect(items.filter((item) => item.link).map((item) => item.link)).toEqual(["/portal"]);
  });

  it("lista as mais recentes primeiro e marca como lidas (só as próprias)", async () => {
    await deliver.execute({ to: { accountIds: [GUARDIAN] }, kind: "a", title: "Primeira" });
    clock.advance(60_000);
    await deliver.execute({ to: { accountIds: [GUARDIAN] }, kind: "b", title: "Segunda" });
    const { items, unread } = await list.execute({ accountId: GUARDIAN });
    expect(items.map((item) => item.title)).toEqual(["Segunda", "Primeira"]);
    expect(unread).toBe(2);

    const markRead = new MarkNotificationReadUseCase(repo, clock);
    await expect(
      markRead.execute({ accountId: ADMIN, notificationId: items[0].id }),
    ).rejects.toThrow(NotificationNotFoundError);
    const read = await markRead.execute({ accountId: GUARDIAN, notificationId: items[0].id });
    expect(read.readAt).toBeDefined();
    expect((await list.execute({ accountId: GUARDIAN, unreadOnly: true })).items).toHaveLength(1);

    expect(
      await new MarkAllNotificationsReadUseCase(repo, clock).execute({ accountId: GUARDIAN }),
    ).toEqual({ updated: 1 });
    expect((await list.execute({ accountId: GUARDIAN })).unread).toBe(0);
  });
});
