import { formatLevel, SLOT_LABEL } from "../domain/catechesis.js";
import type { CatechesisClass } from "../domain/catechesis-class.js";

/** "Comunhão · 1.º ano — Turma A" */
export function classLabel(klass: CatechesisClass): string {
  return `${formatLevel(klass.level)} — Turma ${klass.section}`;
}

/** "Comunhão · 1.º ano · A" (forma curta, para listas e alertas) */
export function classShortLabel(klass: Pick<CatechesisClass, "level" | "section">): string {
  return `${formatLevel(klass.level)} · ${klass.section}`;
}

/** "Sábado de manhã · 08:00 · Sala 04" */
export function classSchedule(klass: CatechesisClass): string {
  return [SLOT_LABEL[klass.slot], klass.startTime, klass.room].filter(Boolean).join(" · ");
}

/** "2026-10-10" → "10/10" */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export const firstName = (fullName: string) => fullName.split(" ")[0] ?? fullName;
