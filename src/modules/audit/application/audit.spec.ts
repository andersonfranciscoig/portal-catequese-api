import { describe, expect, it } from "vitest";

import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import { InMemoryActivityRepository } from "../infrastructure/persistence/in-memory-activity.repository.js";
import { AuditActivityRecorder } from "./audit-activity-recorder.js";
import { AccountDirectory } from "./ports/account-directory.js";
import { ListActivityUseCase } from "./use-cases/list-activity.use-case.js";

const ADMIN = "6f9a2a1e-0000-4000-8000-000000000001";
const USER = "6f9a2a1e-0000-4000-8000-000000000002";

class FakeDirectory extends AccountDirectory {
  async namesFor(ids: string[]) {
    const names: Record<string, string> = {
      [ADMIN]: "Anderson Francisco",
      [USER]: "Teresa Domingos",
    };
    return Object.fromEntries(ids.filter((id) => names[id]).map((id) => [id, names[id]]));
  }
}

describe("Registo de atividade", () => {
  async function setup() {
    const entries = new InMemoryActivityRepository();
    const clock = new FixedClock();
    const recorder = new AuditActivityRecorder(entries, clock);
    await recorder.record({
      actorId: USER,
      category: "AUTH",
      action: "identity.login",
      summary: "Entrou no portal",
    });
    clock.advance(60_000);
    await recorder.record({
      actorId: ADMIN,
      category: "ADMIN",
      action: "identity.account_blocked",
      summary: "Bloqueou a conta de Teresa Domingos: teste",
      targetAccountId: USER,
    });
    clock.advance(60_000);
    await recorder.record({
      category: "ADMIN",
      action: "platform.access_requested",
      summary: "Rosa pediu acesso",
    });
    return new ListActivityUseCase(entries, new FakeDirectory());
  }

  it("lista o mais recente primeiro, com os nomes de quem fez e de quem foi afetado", async () => {
    const list = await setup();
    const entries = await list.execute({ limit: 10 });
    expect(entries.map((entry) => entry.action)).toEqual([
      "platform.access_requested",
      "identity.account_blocked",
      "identity.login",
    ]);
    expect(entries[1]).toMatchObject({
      actorName: "Anderson Francisco",
      targetName: "Teresa Domingos",
    });
    expect(entries[0].actorName).toBeUndefined();
  });

  it("filtra por conta envolvida, área e texto", async () => {
    const list = await setup();
    expect((await list.execute({ involvingAccountId: USER, limit: 10 })).length).toBe(2);
    expect((await list.execute({ category: "AUTH", limit: 10 })).length).toBe(1);
    expect((await list.execute({ search: "BLOQUEOU", limit: 10 })).length).toBe(1);
  });
});
