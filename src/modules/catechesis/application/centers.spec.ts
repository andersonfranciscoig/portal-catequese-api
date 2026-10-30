import { beforeEach, describe, expect, it } from "vitest";

import {
  SANTA_TERESINHA_CENTER_ID,
  SEDE_CENTER_ID,
} from "../../../shared/domain/parish-centers.js";
import { listedCenter } from "./center-scope.js";
import {
  CenterForbiddenError,
  CenterInactiveError,
  CenterNotFoundError,
} from "../domain/errors/catechesis.errors.js";
import { CenterStatus } from "../domain/center.js";
import {
  CreateCenterUseCase,
  ListActiveCentersUseCase,
  ListScopedCentersUseCase,
  UpdateCenterUseCase,
} from "./use-cases/centers.use-cases.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

let ctx: ReturnType<typeof createCatechesisTestContext>;

beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

const child = (fullName: string) => ({
  accountId: IDS.guardian,
  guardian: { relationship: "FATHER" as const },
  catechumen: {
    fullName,
    birthDate: "2017-05-02",
    gender: "FEMALE" as const,
    address: "Rua da Missão, Maianga",
    sacraments: { baptism: true, firstCommunion: false },
  },
  catechesis: {
    type: "NEW" as const,
    level: "COMMUNION_1" as const,
    preferredSlot: "SATURDAY_MORNING" as const,
  },
});

describe("Centros de catequese", () => {
  it("a lista pública só devolve centros ativos", async () => {
    const active = new ListActiveCentersUseCase(ctx.centers);
    const { items } = await active.execute();
    expect(items.map((item) => item.id)).toEqual([
      SEDE_CENTER_ID,
      SANTA_TERESINHA_CENTER_ID,
      "a1000000-0000-4000-8000-000000000003",
    ]);
    expect(items.every((item) => item.status === "ACTIVE")).toBe(true);
  });

  it("a administração cria, altera e inativa um centro", async () => {
    const created = await new CreateCenterUseCase(ctx.centers, ctx.clock).execute({
      name: "Capalanga",
      location: "Capela de Capalanga",
    });
    expect(created.status).toBe("ACTIVE");
    const updated = await new UpdateCenterUseCase(ctx.centers, ctx.clock).execute({
      id: created.id,
      name: "Capela de Capalanga",
      status: CenterStatus.INACTIVE,
    });
    expect(updated).toMatchObject({ name: "Capela de Capalanga", status: "INACTIVE" });
    const { items } = await new ListActiveCentersUseCase(ctx.centers).execute();
    expect(items.some((item) => item.id === created.id)).toBe(false);
    const parish = await new ListScopedCentersUseCase(ctx.centers).execute({ kind: "parish" });
    expect(parish.items.some((item) => item.id === created.id && item.status === "INACTIVE")).toBe(
      true,
    );
    const sede = await new ListScopedCentersUseCase(ctx.centers).execute({
      kind: "center",
      centerId: SEDE_CENTER_ID,
    });
    expect(sede.items.map((item) => item.id)).toEqual([SEDE_CENTER_ID]);
  });

  it("um centro inativo recusa uma turma nova e um centro inexistente também", async () => {
    const santa = await ctx.centers.findById(SANTA_TERESINHA_CENTER_ID);
    santa!.setStatus(CenterStatus.INACTIVE, ctx.clock.now());
    await ctx.centers.save(santa!);
    await expect(
      ctx.createClass.execute({
        actorId: IDS.coordinator,
        level: "COMMUNION_1",
        section: "A",
        slot: "SATURDAY_MORNING",
        room: "Sala 04",
        capacity: 20,
        centerId: SANTA_TERESINHA_CENTER_ID,
        scope: { kind: "parish" },
      }),
    ).rejects.toBeInstanceOf(CenterInactiveError);
    await expect(
      ctx.createClass.execute({
        actorId: IDS.coordinator,
        level: "COMMUNION_1",
        section: "B",
        slot: "SATURDAY_MORNING",
        room: "Sala 05",
        capacity: 20,
        centerId: "a1000000-0000-4000-8000-000000000099",
        scope: { kind: "parish" },
      }),
    ).rejects.toBeInstanceOf(CenterNotFoundError);
  });

  it("a coordenação de um centro não vê a matrícula do outro", async () => {
    await ctx.submit.execute({
      ...child("Inês Francisco"),
      centerId: SEDE_CENTER_ID,
      scope: { kind: "parish" },
    });
    await ctx.submit.execute({
      ...child("Marta Francisco"),
      centerId: SANTA_TERESINHA_CENTER_ID,
      scope: { kind: "parish" },
    });
    const sede = await ctx.listEnrollments.execute({
      tab: "todas",
      sort: "nome",
      page: 1,
      pageSize: 20,
      centerId: listedCenter({ kind: "center", centerId: SEDE_CENTER_ID }),
    });
    expect(sede.items.map((item) => item.catechumenName)).toEqual(["Inês Francisco"]);
    expect(sede.items[0]?.center).toEqual({ id: SEDE_CENTER_ID, name: "Centro Sede" });
    expect(() =>
      listedCenter({ kind: "center", centerId: SEDE_CENTER_ID }, SANTA_TERESINHA_CENTER_ID),
    ).toThrow(CenterForbiddenError);
    const parish = await ctx.listEnrollments.execute({
      tab: "todas",
      sort: "nome",
      page: 1,
      pageSize: 20,
      centerId: listedCenter({ kind: "parish" }, SANTA_TERESINHA_CENTER_ID),
    });
    expect(parish.items.map((item) => item.catechumenName)).toEqual(["Marta Francisco"]);
  });

  it("a coordenação de centro não cria no centro de outra pessoa", async () => {
    await expect(
      ctx.createClass.execute({
        actorId: IDS.coordinator,
        level: "COMMUNION_1",
        section: "A",
        slot: "SATURDAY_MORNING",
        room: "Sala 04",
        capacity: 20,
        centerId: SANTA_TERESINHA_CENTER_ID,
        scope: { kind: "center", centerId: SEDE_CENTER_ID },
      }),
    ).rejects.toBeInstanceOf(CenterForbiddenError);
  });
});
