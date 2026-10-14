import { ValueObject } from "../../../../shared/domain/value-object.js";
import { InvalidFullNameError } from "../errors/identity.errors.js";

export class FullName extends ValueObject<string> {
  static create(raw: string): FullName {
    const value = raw.trim().replace(/\s+/g, " ");
    if (value.length > 120 || value.split(" ").length < 2) throw new InvalidFullNameError();
    return new FullName(value);
  }

  static restore(value: string): FullName {
    return new FullName(value);
  }

  get firstName(): string {
    return this.value.split(" ")[0];
  }
}
