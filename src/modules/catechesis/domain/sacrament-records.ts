import { isIsoDate } from "./dates.js";
import { InvalidSacramentRecordError } from "./errors/catechesis.errors.js";
import { SACRAMENT_TYPES, type SacramentType } from "./sacraments.js";

/** Nome da paróquia nos registos das celebrações feitas aqui. */
export const PARISH_NAME = "Paróquia Cristo Rei da Paz";

/**
 * Sacramento recebido por um catequizando (no máximo um por tipo). Sem data
 * nem paróquia nos registos antigos (vindos só do "batizado sim/não").
 */
export interface SacramentRecord {
  id: string;
  catechumenId: string;
  type: SacramentType;
  /** YYYY-MM-DD */
  date?: string;
  parish?: string;
  /** Celebração desta paróquia onde o recebeu (concluída pela coordenação). */
  celebrationId?: string;
  recordedAt: Date;
  recordedBy?: string;
}

/** Os dados de um registo que importam às regras. */
export type SacramentFacts = Pick<SacramentRecord, "date" | "parish" | "celebrationId">;

/** "O Batismo" */
const THE: Record<SacramentType, string> = {
  BAPTISM: "O Batismo",
  FIRST_COMMUNION: "A Primeira Comunhão",
  CONFIRMATION: "O Crisma",
};
/** "o Batismo" */
const THE_LOWER: Record<SacramentType, string> = {
  BAPTISM: "o Batismo",
  FIRST_COMMUNION: "a Primeira Comunhão",
  CONFIRMATION: "o Crisma",
};
/** "do Batismo" */
const OF: Record<SacramentType, string> = {
  BAPTISM: "do Batismo",
  FIRST_COMMUNION: "da Primeira Comunhão",
  CONFIRMATION: "do Crisma",
};

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Recebido numa celebração desta paróquia ou com o nome da paróquia. */
export function isInThisParish(record: Pick<SacramentRecord, "celebrationId" | "parish">) {
  return Boolean(record.celebrationId) || normalize(record.parish ?? "") === normalize(PARISH_NAME);
}

const formatDate = (date: string) => date.split("-").reverse().join("/");

/**
 * Confirma que os sacramentos de um catequizando (depois de uma mudança) são
 * coerentes: a ordem Batismo → Primeira Comunhão → Crisma, datas válidas,
 * nunca no futuro nem antes do nascimento, e por ordem entre si.
 */
export function assertCoherent(
  records: Partial<Record<SacramentType, SacramentFacts>>,
  context: { birthDate: string; today: string },
): void {
  SACRAMENT_TYPES.forEach((type, index) => {
    const record = records[type];
    if (!record) return;
    const previous = SACRAMENT_TYPES[index - 1];
    if (previous && !records[previous]) {
      throw new InvalidSacramentRecordError(`${THE[type]} exige ${THE_LOWER[previous]}.`);
    }
    const date = record.date;
    if (date === undefined) return;
    if (!isIsoDate(date)) {
      throw new InvalidSacramentRecordError(`A data ${OF[type]} não é válida.`);
    }
    if (date > context.today) {
      throw new InvalidSacramentRecordError(`A data ${OF[type]} não pode ser no futuro.`);
    }
    if (date < context.birthDate) {
      throw new InvalidSacramentRecordError(
        `A data ${OF[type]} não pode ser antes do nascimento (${formatDate(context.birthDate)}).`,
      );
    }
    for (const before of SACRAMENT_TYPES.slice(0, index)) {
      const earlier = records[before]?.date;
      if (earlier && date < earlier) {
        throw new InvalidSacramentRecordError(
          `${THE[type]} não pode ser antes ${OF[before]} (${formatDate(earlier)}).`,
        );
      }
    }
  });
}

/** Ao retirar um sacramento, os seguintes não podem ficar sem ele. */
export function assertCanRemove(
  type: SacramentType,
  records: Partial<Record<SacramentType, unknown>>,
): void {
  const later = SACRAMENT_TYPES.slice(SACRAMENT_TYPES.indexOf(type) + 1).find(
    (item) => records[item],
  );
  if (later) {
    throw new InvalidSacramentRecordError(
      `Retire primeiro ${THE_LOWER[later]}: não pode ficar sem ${THE_LOWER[type]}.`,
    );
  }
}

/** Nome da paróquia sem espaços a mais; vazio = desconhecida. */
export function cleanParish(parish: string | null | undefined): string | undefined {
  const clean = parish?.trim().replace(/\s+/g, " ");
  if (clean && clean.length > 120) {
    throw new InvalidSacramentRecordError("O nome da paróquia pode ter no máximo 120 caracteres.");
  }
  return clean || undefined;
}

/**
 * Junta o que a família indica na matrícula aos registos que já existem, sem
 * apagar nada: só preenche a data e a paróquia que faltam (os registos de uma
 * celebração desta paróquia não se mexem).
 */
export function mergeDeclared(
  current: SacramentFacts | undefined,
  declared: { date?: string; parish?: string },
): SacramentFacts {
  if (!current) return { date: declared.date, parish: declared.parish };
  if (current.celebrationId) return current;
  return {
    ...current,
    date: current.date ?? declared.date,
    parish: current.parish ?? declared.parish,
  };
}

/**
 * Registos a criar a partir dos "sim/não" antigos (a migração
 * `sacramentos_registos` faz o mesmo em SQL): sem data, sem paróquia.
 */
export function backfillRecords(
  catechumens: { id: string; baptized: boolean; firstCommunion: boolean; updatedAt: Date }[],
  newId: () => string,
): SacramentRecord[] {
  return catechumens.flatMap((catechumen) => {
    const types: SacramentType[] = [
      ...(catechumen.baptized ? (["BAPTISM"] as const) : []),
      ...(catechumen.firstCommunion ? (["FIRST_COMMUNION"] as const) : []),
    ];
    return types.map((type) => ({
      id: newId(),
      catechumenId: catechumen.id,
      type,
      recordedAt: catechumen.updatedAt,
    }));
  });
}

/** Ano catequético (setembro a agosto) em que cai uma data: "2026-10-10" → "2026/2027". */
export function catecheticalYearOf(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 9 ? year : year - 1;
  return `${start}/${start + 1}`;
}
