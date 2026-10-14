import { WeakPasswordError } from "../errors/identity.errors.js";

const MAX_BYTES = 72;

export class Password {
  private constructor(readonly value: string) {}

  static create(raw: string): Password {
    if (raw.length < 8) throw new WeakPasswordError("Use pelo menos 8 caracteres.");
    if (!/\d/.test(raw) || !/[a-zA-Z]/.test(raw)) {
      throw new WeakPasswordError("Use letras e números.");
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
      throw new WeakPasswordError("A palavra-passe é demasiado longa.");
    }
    return new Password(raw);
  }

  toJSON(): string {
    return "[protegida]";
  }

  toString(): string {
    return "[protegida]";
  }
}
