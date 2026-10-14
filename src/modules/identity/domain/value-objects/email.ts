import { ValueObject } from "../../../../shared/domain/value-object.js";
import { InvalidEmailError } from "../errors/identity.errors.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Email extends ValueObject<string> {
  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (value.length > 254 || !EMAIL_PATTERN.test(value)) throw new InvalidEmailError();
    return new Email(value);
  }

  static restore(value: string): Email {
    return new Email(value);
  }
}
