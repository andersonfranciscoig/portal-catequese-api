import { ValueObject } from "../../../../shared/domain/value-object.js";
import { InvalidContactError } from "../errors/platform.errors.js";

/**
 * Contacto de quem pede acesso. O módulo tem o seu próprio modelo (não usa o do
 * módulo de identidade): telemóvel angolano em E.164 e email em minúsculas.
 */
export class ContactPhone extends ValueObject<string> {
  static create(raw: string): ContactPhone {
    const digits = raw.replace(/\D/g, "").replace(/^(00)?244/, "");
    if (!/^9\d{8}$/.test(digits)) {
      throw new InvalidContactError("Introduza um número de telefone angolano válido.");
    }
    return new ContactPhone(`+244${digits}`);
  }

  static restore(value: string): ContactPhone {
    return new ContactPhone(value);
  }
}

export class ContactEmail extends ValueObject<string> {
  static create(raw: string): ContactEmail {
    const value = raw.trim().toLowerCase();
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      throw new InvalidContactError("Introduza um email válido.");
    }
    return new ContactEmail(value);
  }

  static restore(value: string): ContactEmail {
    return new ContactEmail(value);
  }
}
