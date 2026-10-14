import { Clock } from "../domain/clock.js";

/** Relógio controlado nos testes. */
export class FixedClock extends Clock {
  constructor(private current = new Date("2026-10-13T10:00:00.000Z")) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
