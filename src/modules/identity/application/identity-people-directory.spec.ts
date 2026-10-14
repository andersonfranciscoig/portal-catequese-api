import { describe, expect, it } from "vitest";

import { createIdentityTestContext } from "../testing/identity-test-context.js";
import { IdentityPeopleDirectory } from "./identity-people-directory.js";

describe("Diretório de pessoas (para os outros módulos)", () => {
  it("dá nome, contacto, papéis e se é catequista aprovado", async () => {
    const ctx = createIdentityTestContext();
    const directory = new IdentityPeopleDirectory(ctx.accounts);
    const maria = await ctx.seedAccount({
      fullName: "Maria José",
      phone: "923111222",
      roles: ["CATECHIST", "GUARDIAN"],
    });
    const lucas = await ctx.seedAccount({
      fullName: "Lucas Pedro",
      phone: "923111333",
      roles: ["CATECHIST"],
    });

    expect(await directory.find(maria.id.value)).toMatchObject({
      fullName: "Maria José",
      phone: "+244923111222",
      roles: ["CATECHIST", "GUARDIAN"],
      approvedCatechist: false,
      active: true,
    });
    maria.approve(new Date());
    await ctx.accounts.save(maria);
    expect((await directory.find(maria.id.value))?.approvedCatechist).toBe(true);

    const found = await directory.findMany([
      lucas.id.value,
      "não-é-um-id",
      maria.id.value,
      lucas.id.value,
    ]);
    expect(found.map((person) => person.fullName)).toEqual(["Lucas Pedro", "Maria José"]);
    expect(await directory.find("não-é-um-id")).toBeNull();
  });
});
