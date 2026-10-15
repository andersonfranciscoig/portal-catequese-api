import { beforeEach, describe, expect, it } from "vitest";

import { ACCESS_REQUEST_APPROVED } from "../../../shared/application/integration-events.js";
import {
  AccessRequestAlreadyDecidedError,
  DuplicateAccessRequestError,
  InvalidAccessRequestError,
  InvalidContactError,
} from "../domain/errors/platform.errors.js";
import { ADMIN_ID, createPlatformTestContext } from "../testing/platform-test-context.js";

const request = {
  fullName: "Rosa Afonso",
  phone: "923 555 111",
  email: "Rosa@Gmail.com",
  profile: "GUARDIAN" as const,
  message: "Quero testar a matrícula.",
};

describe("Fase de lançamento e estado do portal", () => {
  let ctx: ReturnType<typeof createPlatformTestContext>;
  beforeEach(() => {
    ctx = createPlatformTestContext();
  });

  it("começa em fase de testes, com o portal aberto", async () => {
    expect(await ctx.publicStatus.execute()).toEqual({ launchMode: "BETA", portalOpen: true });
  });

  it("abre a todos e regista quem e quando", async () => {
    const status = await ctx.setLaunchMode.execute({ actorId: ADMIN_ID, mode: "PUBLIC" });
    expect(status).toMatchObject({ launchMode: "PUBLIC", launchChangedBy: ADMIN_ID });
    expect(ctx.activity.actions()).toEqual(["platform.launch_public"]);
    // Repetir o mesmo modo não regista nada de novo.
    await ctx.setLaunchMode.execute({ actorId: ADMIN_ID, mode: "PUBLIC" });
    expect(ctx.activity.entries).toHaveLength(1);
  });

  it("encerra com aviso e previsão, e reabre limpando o aviso", async () => {
    const closed = await ctx.setPortalStatus.execute({
      actorId: ADMIN_ID,
      open: false,
      message: "Manutenção",
      reopensAt: "2026-10-20",
    });
    expect(closed).toMatchObject({
      portalOpen: false,
      closedMessage: "Manutenção",
      reopensAt: "2026-10-20",
    });
    expect(await ctx.launchAccess.snapshot()).toEqual({
      mode: "BETA",
      portalOpen: false,
      closedMessage: "Manutenção",
    });

    const reopened = await ctx.setPortalStatus.execute({ actorId: ADMIN_ID, open: true });
    expect(reopened.portalOpen).toBe(true);
    expect(reopened.closedMessage).toBeUndefined();
  });

  it("sem aviso, usa a mensagem de origem", async () => {
    const closed = await ctx.setPortalStatus.execute({ actorId: ADMIN_ID, open: false });
    expect(closed.closedMessage).toContain("temporariamente encerrado");
  });
});

describe("Pedidos de acesso", () => {
  let ctx: ReturnType<typeof createPlatformTestContext>;
  beforeEach(() => {
    ctx = createPlatformTestContext();
  });

  it("guarda o pedido com o contacto normalizado", async () => {
    const view = await ctx.submit.execute(request);
    expect(view).toMatchObject({
      fullName: "Rosa Afonso",
      phone: "+244923555111",
      email: "rosa@gmail.com",
      status: "PENDING",
    });
    expect((await ctx.status.execute()).pendingAccessRequests).toBe(1);
  });

  it("valida os dados", async () => {
    await expect(ctx.submit.execute({ ...request, phone: "123" })).rejects.toThrow(
      InvalidContactError,
    );
    await expect(ctx.submit.execute({ ...request, fullName: "Rosa" })).rejects.toThrow(
      InvalidAccessRequestError,
    );
  });

  it("não aceita um segundo pedido com o mesmo contacto (enquanto não for recusado)", async () => {
    const first = await ctx.submit.execute(request);
    await expect(ctx.submit.execute({ ...request, email: undefined })).rejects.toThrow(
      DuplicateAccessRequestError,
    );
    await ctx.decide.execute({ actorId: ADMIN_ID, requestId: first.id, decision: "REJECTED" });
    await expect(ctx.submit.execute(request)).resolves.toBeTruthy();
  });

  it("aceitar publica o evento e dá acesso aos testes a esse contacto", async () => {
    const { id } = await ctx.submit.execute(request);
    expect(await ctx.launchAccess.isApprovedForBeta("+244923555111")).toBe(false);

    const view = await ctx.decide.execute({
      actorId: ADMIN_ID,
      requestId: id,
      decision: "APPROVED",
    });
    expect(view).toMatchObject({ status: "APPROVED", decidedBy: ADMIN_ID });
    expect(ctx.events.published).toEqual([
      expect.objectContaining({
        name: ACCESS_REQUEST_APPROVED,
        phone: "+244923555111",
        email: "rosa@gmail.com",
      }),
    ]);
    expect(await ctx.launchAccess.isApprovedForBeta("923 555 111")).toBe(true);
    expect(await ctx.launchAccess.isApprovedForBeta("931000000", "rosa@gmail.com")).toBe(true);
  });

  it("um pedido decidido não volta a ser decidido", async () => {
    const { id } = await ctx.submit.execute(request);
    await ctx.decide.execute({
      actorId: ADMIN_ID,
      requestId: id,
      decision: "REJECTED",
      note: "Grupo completo",
    });
    await expect(
      ctx.decide.execute({ actorId: ADMIN_ID, requestId: id, decision: "APPROVED" }),
    ).rejects.toThrow(AccessRequestAlreadyDecidedError);
    expect((await ctx.list.execute({ status: "REJECTED" }))[0].decisionNote).toBe("Grupo completo");
  });
});

describe("Notificações dos pedidos de acesso", () => {
  it("um pedido novo avisa a administração", async () => {
    const ctx = createPlatformTestContext();
    await ctx.submit.execute(request);
    expect(ctx.notifier.last("platform.access_requested")).toMatchObject({
      to: { permission: "SUPER_ADMIN" },
      body: "Rosa Afonso (encarregado de educação) pediu acesso.",
      link: "/admin/pedidos",
    });
  });
});
