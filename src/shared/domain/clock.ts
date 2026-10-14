/** Relógio injetável: o domínio nunca chama `new Date()` diretamente nos testes. */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
