import { beforeEach, describe, expect, it } from "vitest";

import { AnnouncementNotFoundError, AnnouncementRoleError } from "../domain/errors/catechesis.errors.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(() => {
  ctx = createCatechesisTestContext();
});

const TEXT = {
  title: "Reunião de pais",
  body: "Sábado, depois da catequese, na sala paroquial.",
};

describe("Avisos", () => {
  it("conta pessoas distintas e deixa de fora o catequista por aprovar", async () => {
    const list = await ctx.announcements.list.execute({});
    // Encarregados: coordenação, Anderson, Joana e Rosa. Adulto: Carlos.
    // Catequistas aprovados: Maria e Joana (o Lucas ainda não).
    expect(list.audienceCounts).toEqual({
      GUARDIANS: 4,
      CATECHUMENS: 1,
      CATECHISTS: 2,
      ALL: 6,
    });
  });

  it("publica, notifica no sino sem o autor, fixa, lê no portal e apaga", async () => {
    const published = await ctx.announcements.publish.execute({
      actorId: IDS.coordinator,
      ...TEXT,
      audience: "ALL",
      pinned: false,
      notify: true,
    });
    expect(published.author).toBe("Coordenação da catequese");
    expect(published.recipients).toBe(6);
    expect(published.reads).toBe(0);

    const notice = ctx.notifier.last("communication.announcement_published");
    expect(notice).toMatchObject({
      title: "Novo aviso: Reunião de pais",
      link: "/portal/catequese",
      exceptAccountId: IDS.coordinator,
    });
    expect(notice && "accountIds" in notice.to && notice.to.accountIds).toEqual(
      expect.arrayContaining([IDS.guardian, IDS.catechist, IDS.both]),
    );
    expect(notice && "accountIds" in notice.to && notice.to.accountIds).not.toContain(IDS.pending);

    ctx.clock.advance(60_000);
    await ctx.announcements.publish.execute({
      actorId: IDS.coordinator,
      title: "Só catequistas",
      body: "Tragam o livro do catequista na próxima sessão.",
      audience: "CATECHISTS",
      pinned: true,
      notify: false,
    });
    expect(ctx.notifier.kinds().filter((kind) => kind.startsWith("communication."))).toHaveLength(1);

    const list = await ctx.announcements.list.execute({ search: "reuniao" });
    expect(list.items.map((item) => item.title)).toEqual(["Reunião de pais"]);
    expect(list.counts.todos).toBe(2);
    expect(list.counts.CATECHISTS).toBe(1);

    const pinned = await ctx.announcements.pin.execute({
      actorId: IDS.coordinator,
      id: published.id,
      pinned: true,
    });
    expect(pinned.pinned).toBe(true);

    const forGuardian = await ctx.announcements.mine.execute({
      accountId: IDS.guardian,
      roles: ["GUARDIAN"],
      role: "GUARDIAN",
    });
    expect(forGuardian.map((item) => item.title)).toEqual(["Reunião de pais"]);
    expect((await ctx.announcements.list.execute({})).items.find((item) => item.id === published.id)?.reads).toBe(1);

    await ctx.announcements.mine.execute({
      accountId: IDS.guardian,
      roles: ["GUARDIAN"],
      role: "GUARDIAN",
    });
    expect((await ctx.announcements.list.execute({})).items.find((item) => item.id === published.id)?.reads).toBe(1);

    const forCatechist = await ctx.announcements.mine.execute({
      accountId: IDS.catechist,
      roles: ["CATECHIST"],
      role: "CATECHIST",
    });
    expect(forCatechist.map((item) => item.audience)).toEqual(["CATECHISTS", "ALL"]);

    await expect(
      ctx.announcements.mine.execute({
        accountId: IDS.guardian,
        roles: ["GUARDIAN"],
        role: "CATECHIST",
      }),
    ).rejects.toBeInstanceOf(AnnouncementRoleError);

    await ctx.announcements.remove.execute({ actorId: IDS.coordinator, id: published.id });
    await expect(
      ctx.announcements.pin.execute({ actorId: IDS.coordinator, id: published.id, pinned: false }),
    ).rejects.toBeInstanceOf(AnnouncementNotFoundError);
  });
});
