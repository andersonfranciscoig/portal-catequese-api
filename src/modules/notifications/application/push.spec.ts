import { describe, expect, it } from "vitest";

import { PeopleDirectory } from "../../../shared/application/people-directory.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import {
  RecordingPushNotifier,
  RecordingRealtimeBus,
} from "../../../shared/testing/recording-realtime.js";
import { InMemoryNotificationRepository } from "../infrastructure/persistence/in-memory-notification.repository.js";
import { InMemoryPushSubscriptionRepository } from "../infrastructure/persistence/push-subscription.repositories.js";
import { WebPushNotifier, type PushTransport } from "../infrastructure/web-push-notifier.js";
import { DeliverNotificationUseCase } from "./use-cases/deliver-notification.use-case.js";
import {
  RemovePushSubscriptionUseCase,
  SavePushSubscriptionUseCase,
} from "./use-cases/push-subscriptions.use-cases.js";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";

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
  async listByRoles() {
    return [];
  }
  async idsWithPermission() {
    return [A, B];
  }
}

const VAPID = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@exemplo.ao" };

describe("Notificações em tempo real e push", () => {
  it("cada notificação entregue vai para o stream e por push (com ligação ou /notificacoes)", async () => {
    const realtime = new RecordingRealtimeBus();
    const push = new RecordingPushNotifier();
    const deliver = new DeliverNotificationUseCase(
      new InMemoryNotificationRepository(),
      new Directory(),
      new FixedClock(),
      realtime,
      push,
    );
    await deliver.execute({
      to: { permission: "COORDINATION" },
      kind: "x",
      title: "Nova matrícula",
      body: "Inês",
      link: "/coordenacao/matriculas",
      exceptAccountId: B,
    });
    await deliver.execute({ to: { accountIds: [B] }, kind: "y", title: "Olá" });

    const [event] = realtime.to(A, "notification.created");
    const view = (event.data as { notification: { id: string; title: string } }).notification;
    expect(view.title).toBe("Nova matrícula");
    expect(push.sent).toEqual([
      {
        accountIds: [A],
        payload: {
          kind: "notification",
          title: "Nova matrícula",
          body: "Inês",
          url: "/coordenacao/matriculas",
          tag: `notif-${view.id}`,
        },
      },
      {
        accountIds: [B],
        payload: expect.objectContaining({ body: "", url: "/notificacoes" }),
      },
    ]);
  });

  it("uma falha no push nunca anula a entrega", async () => {
    const failing = new RecordingPushNotifier();
    failing.send = () => Promise.reject(new Error("push em baixo"));
    const realtime = new RecordingRealtimeBus();
    realtime.publish = () => {
      throw new Error("stream em baixo");
    };
    const deliver = new DeliverNotificationUseCase(
      new InMemoryNotificationRepository(),
      new Directory(),
      new FixedClock(),
      realtime,
      failing,
    );
    await expect(
      deliver.execute({ to: { accountIds: [A] }, kind: "x", title: "Olá" }),
    ).resolves.toBe(1);
  });

  it("guarda as subscrições por endereço e apaga as expiradas (404/410)", async () => {
    const repo = new InMemoryPushSubscriptionRepository();
    const save = new SavePushSubscriptionUseCase(repo, new FixedClock());
    const sub = (endpoint: string, accountId: string) =>
      save.execute({ accountId, endpoint, keys: { p256dh: "k", auth: "a" } });
    await sub("https://push.exemplo/1", A);
    await sub("https://push.exemplo/1", B); // o navegador mudou de conta
    await sub("https://push.exemplo/2", A);
    await sub("https://push.exemplo/3", A);
    expect([...repo.items.values()].map((item) => item.accountId)).toEqual([B, A, A]);

    const delivered: string[] = [];
    const transport: PushTransport = async (subscription, payload) => {
      if (subscription.endpoint.endsWith("/2"))
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (subscription.endpoint.endsWith("/3"))
        throw Object.assign(new Error("erro"), { statusCode: 500 });
      delivered.push(`${subscription.endpoint} ${payload}`);
    };
    const notifier = new WebPushNotifier(repo, VAPID, transport);
    const payload = { kind: "message", title: "T", body: "B", url: "/x", tag: "t" } as const;
    await notifier.send([A, B], payload);
    expect(delivered).toEqual([`https://push.exemplo/1 ${JSON.stringify(payload)}`]);
    expect([...repo.items.keys()]).toEqual(["https://push.exemplo/1", "https://push.exemplo/3"]);

    await new RemovePushSubscriptionUseCase(repo).execute({
      accountId: A,
      endpoint: "https://push.exemplo/1",
    });
    expect(repo.items.has("https://push.exemplo/1")).toBe(true); // é da conta B
    await new RemovePushSubscriptionUseCase(repo).execute({
      accountId: B,
      endpoint: "https://push.exemplo/1",
    });
    expect(repo.items.has("https://push.exemplo/1")).toBe(false);
  });

  it("sem chaves VAPID o push fica desligado sem falhar", async () => {
    const repo = new InMemoryPushSubscriptionRepository();
    let calls = 0;
    const notifier = new WebPushNotifier(repo, null, async () => {
      calls += 1;
    });
    await notifier.send([A], { kind: "notification", title: "x", body: "", url: "/", tag: "t" });
    expect(notifier.enabled).toBe(false);
    expect(calls).toBe(0);
  });
});
