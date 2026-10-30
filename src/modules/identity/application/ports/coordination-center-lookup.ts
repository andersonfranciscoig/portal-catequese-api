/** O centro de coordenação existe (sem ligar os schemas por chave estrangeira). */
export abstract class CoordinationCenterLookup {
  abstract exists(id: string): Promise<boolean>;
}
