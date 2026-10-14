import { randomUUID } from "node:crypto";

/** Identificador de entidade (UUID v4), independente da base de dados. */
export class UniqueId {
  private constructor(readonly value: string) {}

  static create(): UniqueId {
    return new UniqueId(randomUUID());
  }

  static from(value: string): UniqueId {
    return new UniqueId(value);
  }

  equals(other: UniqueId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
