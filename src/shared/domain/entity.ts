import { UniqueId } from "./unique-id.js";

/** Entidade: tem identidade própria, que se mantém ao longo do tempo. */
export abstract class Entity<Props extends object> {
  protected constructor(
    protected props: Props,
    readonly id: UniqueId = UniqueId.create(),
  ) {}

  equals(other?: Entity<Props>): boolean {
    return other instanceof Entity && this.id.equals(other.id);
  }
}
