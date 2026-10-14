import { describe, expect, it } from "vitest";

import {
  InvalidEmailError,
  InvalidFullNameError,
  InvalidPhoneNumberError,
  WeakPasswordError,
} from "../errors/identity.errors.js";
import { Email } from "./email.js";
import { FullName } from "./full-name.js";
import { Password } from "./password.js";
import { PhoneNumber } from "./phone-number.js";

describe("PhoneNumber", () => {
  it.each(["923482117", "923 482 117", "+244 923 482 117", "00244923482117", "(+244) 923-482-117"])(
    "normaliza %s para E.164",
    (raw) => {
      expect(PhoneNumber.create(raw).value).toBe("+244923482117");
    },
  );

  it.each(["", "12345", "823482117", "92348211", "9234821170", "+351912345678"])(
    "rejeita %s",
    (raw) => {
      expect(() => PhoneNumber.create(raw)).toThrow(InvalidPhoneNumberError);
    },
  );

  it("formata para mostrar", () => {
    expect(PhoneNumber.create("923482117").formatted).toBe("+244 923 482 117");
  });

  it("é igual quando o número é o mesmo", () => {
    expect(PhoneNumber.create("923 482 117").equals(PhoneNumber.create("+244923482117"))).toBe(
      true,
    );
  });
});

describe("Email", () => {
  it("normaliza espaços e maiúsculas", () => {
    expect(Email.create("  Ana.Silva@Gmail.COM ").value).toBe("ana.silva@gmail.com");
  });

  it.each(["", "ana", "ana@", "ana@gmail", "ana silva@gmail.com"])("rejeita %s", (raw) => {
    expect(() => Email.create(raw)).toThrow(InvalidEmailError);
  });
});

describe("FullName", () => {
  it("exige nome e apelido e normaliza espaços", () => {
    const name = FullName.create("  Maria   José  Quintas ");
    expect(name.value).toBe("Maria José Quintas");
    expect(name.firstName).toBe("Maria");
  });

  it.each(["", "Maria", "   "])("rejeita %s", (raw) => {
    expect(() => FullName.create(raw)).toThrow(InvalidFullNameError);
  });
});

describe("Password", () => {
  it("aceita letras e números com 8+ caracteres", () => {
    expect(() => Password.create("catequese1")).not.toThrow();
  });

  it.each([
    ["curta", "abc123"],
    ["só letras", "catequese"],
    ["só números", "12345678"],
    ["mais de 72 bytes", `a1${"x".repeat(80)}`],
  ])("rejeita %s", (_, raw) => {
    expect(() => Password.create(raw)).toThrow(WeakPasswordError);
  });

  it("nunca aparece em JSON nem em texto", () => {
    const password = Password.create("catequese1");
    expect(JSON.stringify({ password })).not.toContain("catequese1");
    expect(`${password}`).not.toContain("catequese1");
  });
});
