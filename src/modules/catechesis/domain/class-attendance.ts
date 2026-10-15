import type { AttendanceStatus } from "./catechesis.js";

/** Presença de um catequizando num encontro. */
export interface AttendanceMark {
  catechumenId: string;
  status: AttendanceStatus;
}

/** Chamada de uma turma num dia de encontro (value object). */
export interface ClassAttendance {
  classId: string;
  /** YYYY-MM-DD */
  date: string;
  marks: AttendanceMark[];
  recordedBy: string;
  recordedAt: Date;
}

/** Presença de um catequizando (para o resumo e a ficha). */
export interface AttendanceEntry {
  date: string;
  status: AttendanceStatus;
}

export interface AttendanceTotals {
  total: number;
  present: number;
  absent: number;
  justified: number;
  /** Percentagem de presenças (0–100), sem encontros = undefined. */
  rate?: number;
}

export function attendanceTotals(entries: AttendanceEntry[]): AttendanceTotals {
  const count = (status: AttendanceStatus) =>
    entries.filter((item) => item.status === status).length;
  const present = count("PRESENT");
  return {
    total: entries.length,
    present,
    absent: count("ABSENT"),
    justified: count("JUSTIFIED"),
    rate: entries.length ? Math.round((present / entries.length) * 100) : undefined,
  };
}
