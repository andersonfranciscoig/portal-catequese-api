import { formatLevel, SLOT_LABEL } from "../domain/catechesis.js";
import type { CatechesisClass } from "../domain/catechesis-class.js";
import type { SacramentType } from "../domain/sacraments.js";

const SACRAMENT_NAME: Record<SacramentType, string> = {
  BAPTISM: "Batismo",
  FIRST_COMMUNION: "Comunhão",
  CONFIRMATION: "Crisma",
};

const AUDIENCE_NAME = { CHILD: "Crianças", ADULT: "Adultos" } as const;

function specialTitle(klass: {
  kind?: string;
  sacrament?: SacramentType;
  audience?: "CHILD" | "ADULT";
  section: string;
  level: CatechesisClass["level"];
}) {
  if (klass.kind === "SPECIAL" && klass.sacrament && klass.audience) {
    return `${SACRAMENT_NAME[klass.sacrament]} · ${AUDIENCE_NAME[klass.audience]} · ${klass.section}`;
  }
  return null;
}

/** "Comunhão · 1.º ano — Turma A" */
export function classLabel(klass: CatechesisClass): string {
  return specialTitle(klass) ?? `${formatLevel(klass.level)} — Turma ${klass.section}`;
}

/** "Comunhão · 1.º ano · A" (forma curta, para listas e alertas) */
export function classShortLabel(
  klass: Pick<CatechesisClass, "level" | "section"> &
    Partial<Pick<CatechesisClass, "kind" | "sacrament" | "audience">>,
): string {
  return specialTitle(klass) ?? `${formatLevel(klass.level)} · ${klass.section}`;
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
