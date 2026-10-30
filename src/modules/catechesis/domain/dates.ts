/**
 * Datas sem hora ("YYYY-MM-DD"), como a catequese as usa (dia do encontro,
 * data de nascimento). Calculadas em UTC para não dependerem do fuso do servidor.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parse(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: string, days: number): string {
  const date = parse(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Soma meses (o dia fica no último do mês se não existir: 31/01 + 1 → 28/02). */
export function addMonths(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return toIsoDate(target);
}

export function weekday(value: string): number {
  return parse(value).getUTCDay();
}

/** Anos completos em `at`. */
export function ageAt(birthDate: string, at: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ay, am, ad] = at.split("-").map(Number);
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
}

/** Angola (UTC+1, sem hora de verão). */
const LUANDA_OFFSET_MS = 60 * 60 * 1000;

/** O dia de hoje em Luanda. */
export function luandaToday(now: Date): string {
  return toIsoDate(new Date(now.getTime() + LUANDA_OFFSET_MS));
}
