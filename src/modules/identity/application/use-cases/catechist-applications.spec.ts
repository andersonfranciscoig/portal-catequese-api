import { describe, expect, it } from "vitest";

import { NotCatechistApproverError } from "../../domain/errors/identity.errors.js";
import { createIdentityTestContext } from "../../testing/identity-test-context.js";

describe("Candidaturas de catequistas pela coordenação", () => {
  it("quem tem 'aprovar catequistas' vê e decide; os outros não", async () => {
    const ctx = createIdentityTestContext();
    const coordinator = await ctx.seedAccount({
      fullName: "Teresa Domingos",
      phone: "923000002",
      permissions: ["COORDINATION", "APPROVE_CATECHISTS"],
    });
    const plain = await ctx.seedAccount({
      fullName: "Rui Coordenação",
      phone: "923000003",
      permissions: ["COORDINATION"],
    });
    const candidate = await ctx.seedAccount({
      fullName: "Lucas Pedro",
      phone: "923000004",
      roles: ["CATECHIST"],
    });

    const pending = await ctx.catechistApplications.execute({ actorId: coordinator.id.value });
    expect(pending.map((item) => item.fullName)).toEqual(["Lucas Pedro"]);
    await expect(ctx.catechistApplications.execute({ actorId: plain.id.value })).rejects.toThrow(
      NotCatechistApproverError,
    );
    await expect(
      ctx.decideCatechist.execute({
        actorId: plain.id.value,
        accountId: candidate.id.value,
        decision: "APPROVED",
      }),
    ).rejects.toThrow(NotCatechistApproverError);

    const view = await ctx.decideCatechist.execute({
      actorId: coordinator.id.value,
      accountId: candidate.id.value,
      decision: "APPROVED",
    });
    expect(view.approval).toBe("APPROVED");
    expect(await ctx.catechistApplications.execute({ actorId: coordinator.id.value })).toEqual([]);
  });
});
