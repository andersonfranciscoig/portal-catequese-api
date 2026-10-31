import { beforeEach, describe, expect, it } from "vitest";

import {
  SANTA_TERESINHA_CENTER_ID,
  SEDE_CENTER_ID,
} from "../../../shared/domain/parish-centers.js";
import type { AccountRepository } from "../../identity/index.js";
import {
  CenterForbiddenError,
  CenterTransferAlreadyDecidedError,
  CenterTransferAlreadyOpenError,
} from "../domain/errors/catechesis.errors.js";
import {
  InMemoryCatechistProfileRepository,
  InMemoryCenterTransferRepository,
} from "../infrastructure/persistence/in-memory/in-memory-catechesis.repositories.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";
import { CatechesisAccess } from "./catechesis-access.js";
import type { CenterScope } from "./center-scope.js";
import {
  CancelCenterTransferUseCase,
  DecideCenterTransferUseCase,
  ListCoordinationCenterTransfersUseCase,
  ListMyCenterTransfersUseCase,
  RequestCenterTransferUseCase,
} from "./use-cases/center-transfers.use-cases.js";

/** Coordenação de cada centro (nos testes, uma conta por centro). */
const ORIGIN_COORDINATOR = "00000000-0000-4000-8000-0000000000a1";
const DESTINATION_COORDINATOR = "00000000-0000-4000-8000-0000000000a2";

const ORIGIN: CenterScope = { kind: "center", centerId: SEDE_CENTER_ID };
const DESTINATION: CenterScope = { kind: "center", centerId: SANTA_TERESINHA_CENTER_ID };

let ctx: ReturnType<typeof createCatechesisTestContext>;
let transfers: InMemoryCenterTransferRepository;
let request: RequestCenterTransferUseCase;
let decide: DecideCenterTransferUseCase;
let cancel: CancelCenterTransferUseCase;
let mine: ListMyCenterTransfersUseCase;
let queue: ListCoordinationCenterTransfersUseCase;

beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
  // A catequista dá aulas no Centro Sede e quer passar para Santa Teresinha.
  await ctx.classWithCatechist(IDS.catechist);
  ctx.people.coordinationOfCenter = async (centerId: string) => [
    centerId === SEDE_CENTER_ID ? ORIGIN_COORDINATOR : DESTINATION_COORDINATOR,
  ];

  transfers = new InMemoryCenterTransferRepository();
  const profiles = new InMemoryCatechistProfileRepository();
  request = new RequestCenterTransferUseCase(
    new CatechesisAccess(ctx.people),
    transfers,
    ctx.catechumens,
    ctx.enrollments,
    ctx.classes,
    ctx.calendars,
    ctx.centers,
    profiles,
    ctx.people,
    ctx.activity,
    ctx.clock,
    ctx.notifier,
  );
  decide = new DecideCenterTransferUseCase(
    transfers,
    ctx.catechumens,
    ctx.enrollments,
    ctx.classes,
    ctx.calendars,
    profiles,
    // Só a aceitação final de um catequista mexe na conta; estes testes não chegam lá.
    {} as AccountRepository,
    ctx.people,
    ctx.activity,
    ctx.clock,
    ctx.notifier,
  );
  cancel = new CancelCenterTransferUseCase(
    transfers,
    ctx.clock,
    ctx.activity,
    ctx.notifier,
    ctx.people,
  );
  mine = new ListMyCenterTransfersUseCase(transfers, ctx.people, ctx.catechumens, ctx.classes);
  queue = new ListCoordinationCenterTransfersUseCase(
    transfers,
    ctx.people,
    ctx.catechumens,
    ctx.classes,
  );
});

const ask = () =>
  request.execute({
    accountId: IDS.catechist,
    kind: "CATECHIST",
    toCenterId: SANTA_TERESINHA_CENTER_ID,
    reason: "Mudei de casa para perto de Santa Teresinha.",
  });

describe("Mudança de centro em dois passos", () => {
  it("o pedido cai primeiro na coordenação de origem, e quem pediu é avisado", async () => {
    const view = await ask();

    expect(view).toMatchObject({ status: "ORIGIN_REVIEW", canCancel: true });
    const toCoordination = ctx.notifier.messages.find(
      (message) =>
        message.kind === "catechesis.center_transfer_requested" &&
        "accountIds" in message.to &&
        !message.to.accountIds.includes(IDS.catechist),
    );
    expect(toCoordination?.to).toEqual({ accountIds: [ORIGIN_COORDINATOR] });
    const toRequester = ctx.notifier.messages.find(
      (message) =>
        message.kind === "catechesis.center_transfer_requested" &&
        "accountIds" in message.to &&
        message.to.accountIds.includes(IDS.catechist),
    );
    expect(toRequester?.title).toBe("Pedido de mudança enviado");
  });

  it("só a origem decide no primeiro passo; o destino ainda não", async () => {
    const { id } = await ask();

    const [atOrigin] = await queue.execute({ scope: ORIGIN });
    const [atDestination] = await queue.execute({ scope: DESTINATION });
    expect(atOrigin).toMatchObject({ canDecide: true, decisionStage: "ORIGIN" });
    expect(atDestination).toMatchObject({ canDecide: false });
    await expect(
      decide.execute({
        actorId: DESTINATION_COORDINATOR,
        id,
        scope: DESTINATION,
        decision: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(CenterForbiddenError);
  });

  it("a origem aprova: passa ao destino, que é avisado, e quem pediu acompanha", async () => {
    const { id } = await ask();

    const forwarded = await decide.execute({
      actorId: ORIGIN_COORDINATOR,
      id,
      scope: ORIGIN,
      decision: "APPROVED",
      note: "Sem objeções.",
    });

    expect(forwarded).toMatchObject({
      status: "DESTINATION_REVIEW",
      originReviewedBy: { id: ORIGIN_COORDINATOR },
      originNote: "Sem objeções.",
    });
    expect(ctx.notifier.last("catechesis.center_transfer_forwarded")?.to).toEqual({
      accountIds: [DESTINATION_COORDINATOR],
    });
    expect(
      ctx.notifier.messages.some(
        (message) =>
          message.kind === "catechesis.center_transfer_forwarded" &&
          "accountIds" in message.to &&
          message.to.accountIds.includes(IDS.catechist),
      ),
    ).toBe(true);

    const [atDestination] = await queue.execute({ scope: DESTINATION });
    expect(atDestination).toMatchObject({ canDecide: true, decisionStage: "DESTINATION" });
    const [own] = await mine.execute({ accountId: IDS.catechist });
    expect(own).toMatchObject({ status: "DESTINATION_REVIEW", canCancel: true });
  });

  it("o destino recusa: fica recusado e quem pediu é avisado", async () => {
    const { id } = await ask();
    await decide.execute({ actorId: ORIGIN_COORDINATOR, id, scope: ORIGIN, decision: "APPROVED" });

    const rejected = await decide.execute({
      actorId: DESTINATION_COORDINATOR,
      id,
      scope: DESTINATION,
      decision: "REJECTED",
      note: "Não há turma para esta etapa.",
    });

    expect(rejected).toMatchObject({
      status: "REJECTED",
      decisionNote: "Não há turma para esta etapa.",
    });
    expect(ctx.notifier.last("catechesis.center_transfer_rejected")).toMatchObject({
      to: { accountIds: [IDS.catechist] },
      body: "Não há turma para esta etapa.",
    });
  });

  it("a origem recusa: o destino nunca chega a ver para decidir", async () => {
    const { id } = await ask();

    const rejected = await decide.execute({
      actorId: ORIGIN_COORDINATOR,
      id,
      scope: ORIGIN,
      decision: "REJECTED",
    });

    expect(rejected).toMatchObject({
      status: "REJECTED",
      originReviewedBy: { id: ORIGIN_COORDINATOR },
    });
    expect(ctx.notifier.kinds()).not.toContain("catechesis.center_transfer_forwarded");
    await expect(
      decide.execute({
        actorId: DESTINATION_COORDINATOR,
        id,
        scope: DESTINATION,
        decision: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(CenterForbiddenError);
  });

  it("não deixa abrir outro pedido enquanto um está em análise (em qualquer passo)", async () => {
    const { id } = await ask();
    await expect(ask()).rejects.toBeInstanceOf(CenterTransferAlreadyOpenError);

    await decide.execute({ actorId: ORIGIN_COORDINATOR, id, scope: ORIGIN, decision: "APPROVED" });
    await expect(ask()).rejects.toBeInstanceOf(CenterTransferAlreadyOpenError);
  });

  it("quem pediu cancela no destino: avisa a coordenação de destino", async () => {
    const { id } = await ask();
    await decide.execute({ actorId: ORIGIN_COORDINATOR, id, scope: ORIGIN, decision: "APPROVED" });

    await cancel.execute({ accountId: IDS.catechist, id });

    expect(ctx.notifier.last("catechesis.center_transfer_cancelled")?.to).toEqual({
      accountIds: [DESTINATION_COORDINATOR],
    });
    await expect(cancel.execute({ accountId: IDS.catechist, id })).rejects.toBeInstanceOf(
      CenterTransferAlreadyDecidedError,
    );
  });

  it("a coordenação geral (paróquia) pode agir em qualquer passo", async () => {
    const { id } = await ask();
    const parish: CenterScope = { kind: "parish" };

    const forwarded = await decide.execute({
      actorId: IDS.coordinator,
      id,
      scope: parish,
      decision: "APPROVED",
    });
    expect(forwarded.status).toBe("DESTINATION_REVIEW");
    const [item] = await queue.execute({ scope: parish });
    expect(item).toMatchObject({ canDecide: true, decisionStage: "DESTINATION" });
  });
});
