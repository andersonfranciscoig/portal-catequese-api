/** Objeto de valor: sem identidade, imutável, igual quando os valores são iguais. */
export abstract class ValueObject<Value> {
  protected constructor(readonly value: Value) {}

  equals(other?: ValueObject<Value>): boolean {
    return (
      other instanceof ValueObject && JSON.stringify(this.value) === JSON.stringify(other.value)
    );
  }
}
