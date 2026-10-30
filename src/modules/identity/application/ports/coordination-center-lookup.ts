/** O centro existe (sem ligar os schemas por chave estrangeira). */
export abstract class CoordinationCenterLookup {
  abstract exists(id: string): Promise<boolean>;
  /** `null` se o centro não existir. */
  abstract status(id: string): Promise<"ACTIVE" | "INACTIVE" | null>;
}
