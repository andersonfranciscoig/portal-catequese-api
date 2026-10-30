import { weekday } from "./dates.js";

/*
 * Prazo da chamada: o catequista lança-a até ao fim do dia do encontro
 * (23:59:59, hora de Luanda). Depois disso o encontro fica em atraso.
 */

/** Alerta de chamada por lançar já enviado. */
export interface RollReminder {
  classId: string;
  /** YYYY-MM-DD (dia do encontro) */
  date: string;
  alertedAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Só se avisa nas primeiras 24 horas depois do prazo (os mais antigos ficam na lista). */
export const REMINDER_WINDOW_MS = DAY_MS;

/** Até onde a lista de chamadas em atraso olha para trás. */
export const PENDING_ROLLS_DAYS = 60;

/** 23:59:59 do dia do encontro em Luanda (UTC+1, sem hora de verão). */
export function rollDeadline(date: string): Date {
  return new Date(`${date}T23:59:59.000+01:00`);
}

/** O prazo já passou. */
export function isRollLate(date: string, now: Date): boolean {
  return now.getTime() > rollDeadline(date).getTime();
}

/** O prazo passou há menos de 24 horas (é altura de avisar). */
export function isWithinReminderWindow(date: string, now: Date): boolean {
  const elapsed = now.getTime() - rollDeadline(date).getTime();
  return elapsed > 0 && elapsed < REMINDER_WINDOW_MS;
}

/** Dias desde o encontro (`today` em Luanda). */
export function daysSince(date: string, today: string): number {
  return Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "2026-10-24" → "sábado, 24/10" */
export function sessionDayLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${WEEKDAY[weekday(date)]}, ${day}/${month}`;
}
