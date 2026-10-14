import { ValueObject } from "../../../../shared/domain/value-object.js";
import { InvalidPhoneNumberError } from "../errors/identity.errors.js";

export class PhoneNumber extends ValueObject<string> {
  static create(raw: string): PhoneNumber {
    const digits = raw.replace(/\D/g, "").replace(/^(00)?244/, "");
    if (!/^9\d{8}$/.test(digits)) throw new InvalidPhoneNumberError();
    return new PhoneNumber(`+244${digits}`);
  }

  static restore(value: string): PhoneNumber {
    return new PhoneNumber(value);
  }

  get formatted(): string {
    const local = this.value.slice(4);
    return `+244 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
}
