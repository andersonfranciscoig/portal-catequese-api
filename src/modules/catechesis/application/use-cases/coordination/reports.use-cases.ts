import type {
  PaymentsLedger,
  PaymentSnapshot,
} from "../../../../../shared/application/payments-ledger.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import {
  formatLevel,
  previousYearLabel,
  SLOT_LABEL,
  stageOf,
  type AttendanceStatus,
  type CatechesisLevel,
  type CatechesisStage,
  type EnrollmentStatus,
} from "../../../domain/catechesis.js";
import { luandaToday } from "../../../domain/dates.js";
import { matchesCenter } from "../../center-scope.js";
import {
  CalendarNotDefinedError,
  ReportNotAllowedError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  ClassRepository,
  EnrollmentRepository,
  EvaluationRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { GetSessionUseCase, ListSessionDaysUseCase } from "./attendance.use-cases.js";
import type { ListCatechumensUseCase } from "./catechumens.use-cases.js";
import type { ListClassesUseCase } from "./class.use-cases.js";

/** Encontros mais recentes na evolução das presenças. */
const RECENT_SESSIONS = 12;

const ACTIVE: EnrollmentStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "WAITLIST",
];

export interface PaymentsSummaryView {
  /** Kwanzas recebidos (pagos). */
  received: number;
  paidCount: number;
  underReview: number;
  awaiting: number;
  /** Kwanzas ainda por receber (por pagar + por validar). */
  outstanding: number;
}

export interface ReportView {
  catecheticalYear: string;
  stats: { catechumens: number; confirmed: number };
  classes: { total: number; averageOccupancy: number };
  /** Matrículas ativas por nível. */
  levels: { level: CatechesisLevel; count: number }[];
  /** Presentes em cada encontro com chamada lançada (os mais recentes). */
  attendance: { date: string; present: number; total: number; rate: number }[];
  /** Média desses encontros (0–100). */
  attendanceRate?: number;
  /** Resultados do ano anterior por etapa. */
  results: {
    year: string;
    stages: { stage: CatechesisStage; passed: number; repeat: number; pending: number }[];
  };
  /** Só para quem tem acesso ao financeiro. */
  payments: PaymentsSummaryView | null;
}

const STAGES: CatechesisStage[] = ["BAPTISM", "COMMUNION", "BIBLICAL", "CONFIRMATION"];

export function summarizePayments(payments: PaymentSnapshot[]): PaymentsSummaryView {
  const paid = payments.filter((item) => item.status === "PAID");
  return {
    received: paid.reduce((sum, item) => sum + item.amount, 0),
    paidCount: paid.length,
    underReview: payments.filter((item) => item.status === "UNDER_REVIEW").length,
    awaiting: payments.filter((item) => ["AWAITING_PAYMENT", "REJECTED"].includes(item.status))
      .length,
    outstanding: payments
      .filter((item) => item.status !== "PAID")
      .reduce((sum, item) => sum + item.amount, 0),
  };
}

/** Indicadores do ano catequético em curso. */
export class GetReportUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly ledger: PaymentsLedger,
    private readonly clock: Clock,
  ) {}

  async execute({
    canSeeFinance,
    centerId,
  }: {
    canSeeFinance: boolean;
    centerId?: string;
  }): Promise<ReportView> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const today = luandaToday(this.clock.now());
    const [all, classes] = await Promise.all([
      this.enrollments.list({ catecheticalYear: calendar.label }),
      this.classes.listByYear(calendar.label),
    ]);
    const visible = all.filter((item) => matchesCenter(item.centerId, centerId));
    const visibleClasses = classes.filter((item) => matchesCenter(item.centerId, centerId));
    const active = visible.filter((item) => ACTIVE.includes(item.status));
    const confirmed = visible.filter((item) => item.isConfirmed);

    const levels = new Map<CatechesisLevel, number>();
    for (const item of active) levels.set(item.level, (levels.get(item.level) ?? 0) + 1);

    const occupancy = visibleClasses.map(
      (klass) =>
        confirmed.filter((item) => item.classId === klass.id.value).length / klass.capacity,
    );

    // Presenças: todas as chamadas lançadas do ano, agrupadas por dia.
    const rolls = (
      await Promise.all(visibleClasses.map((klass) => this.attendance.listForClass(klass.id.value)))
    ).flat();
    const perDay = new Map<string, { present: number; total: number }>();
    for (const roll of rolls.filter((item) => item.date <= today)) {
      const day = perDay.get(roll.date) ?? { present: 0, total: 0 };
      day.present += roll.marks.filter((mark) => mark.status === "PRESENT").length;
      day.total += roll.marks.length;
      perDay.set(roll.date, day);
    }
    const attendance = [...perDay.entries()]
      .filter(([, day]) => day.total > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-RECENT_SESSIONS)
      .map(([date, day]) => ({
        date,
        ...day,
        rate: Math.round((day.present / day.total) * 100),
      }));
    const present = attendance.reduce((sum, day) => sum + day.present, 0);
    const marked = attendance.reduce((sum, day) => sum + day.total, 0);

    return {
      catecheticalYear: calendar.label,
      stats: { catechumens: active.length, confirmed: confirmed.length },
      classes: {
        total: visibleClasses.length,
        averageOccupancy: occupancy.length
          ? Math.round((occupancy.reduce((sum, ratio) => sum + ratio, 0) / occupancy.length) * 100)
          : 0,
      },
      levels: [...levels.entries()].map(([level, count]) => ({ level, count })),
      attendance,
      attendanceRate: marked ? Math.round((present / marked) * 100) : undefined,
      results: await this.previousResults(previousYearLabel(calendar.label)),
      payments: canSeeFinance
        ? summarizePayments(
            await this.ledger.listForEnrollments(visible.map((item) => item.id.value)),
          )
        : null,
    };
  }

  private async previousResults(year: string): Promise<ReportView["results"]> {
    const classes = await this.classes.listByYear(year);
    const perClass = await Promise.all(
      classes.map(async (klass) => {
        const [members, evaluations] = await Promise.all([
          this.enrollments.listConfirmedInClass(klass.id.value),
          this.evaluations.listForClass(klass.id.value),
        ]);
        const outcome = new Map(evaluations.map((item) => [item.catechumenId, item.outcome]));
        const decided = members.map((item) => outcome.get(item.catechumenId));
        return {
          stage: stageOf(klass.level),
          passed: decided.filter((item) => item === "PASSED").length,
          repeat: decided.filter((item) => item === "REPEAT").length,
          pending: decided.filter((item) => !item).length,
        };
      }),
    );
    return {
      year,
      stages: STAGES.map((stage) => {
        const ofStage = perClass.filter((item) => item.stage === stage);
        return {
          stage,
          passed: ofStage.reduce((sum, item) => sum + item.passed, 0),
          repeat: ofStage.reduce((sum, item) => sum + item.repeat, 0),
          pending: ofStage.reduce((sum, item) => sum + item.pending, 0),
        };
      }).filter((item) => item.passed + item.repeat + item.pending > 0),
    };
  }
}

/* ───────────── Exportações (CSV) ───────────── */

export const REPORT_EXPORTS = [
  "catechumens",
  "classes",
  "catechist-attendance",
  "payments",
] as const;
export type ReportExport = (typeof REPORT_EXPORTS)[number];

export interface ReportTable {
  filename: string;
  header: string[];
  rows: (string | number | undefined)[][];
}

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  SUBMITTED: "Recebida",
  UNDER_REVIEW: "Em análise",
  APPROVED: "Aprovada",
  PENDING_CONFIRMATION: "Documentos em falta",
  CONFIRMED: "Confirmada",
  REJECTED: "Recusada",
  WAITLIST: "Lista de espera",
};

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Presente",
  ABSENT: "Faltou",
  JUSTIFIED: "Falta justificada",
};

const PAYMENT_STATUS_LABEL: Record<PaymentSnapshot["status"], string> = {
  AWAITING_PAYMENT: "Por pagar",
  UNDER_REVIEW: "Por validar",
  PAID: "Pago",
  REJECTED: "Comprovativo recusado",
};

const PAYMENT_METHOD_LABEL: Record<NonNullable<PaymentSnapshot["method"]>, string> = {
  EXPRESS_REFERENCE: "Multicaixa Express",
  BANK_TRANSFER: "Transferência bancária",
  CASH: "Numerário",
};

const dmy = (date: string) => date.slice(0, 10).split("-").reverse().join("/");

/** Listas do ano para descarregar (a apresentação escreve o CSV). */
export class ExportReportUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly listCatechumens: ListCatechumensUseCase,
    private readonly listClasses: ListClassesUseCase,
    private readonly sessionDays: ListSessionDaysUseCase,
    private readonly session: GetSessionUseCase,
    private readonly ledger: PaymentsLedger,
  ) {}

  async execute({
    kind,
    canSeeFinance,
    centerId,
  }: {
    kind: ReportExport;
    canSeeFinance: boolean;
    centerId?: string;
  }): Promise<ReportTable> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const year = calendar.label.replace("/", "-");

    switch (kind) {
      case "catechumens": {
        const { items } = await this.listCatechumens.execute({
          page: 1,
          pageSize: 100_000,
          centerId,
        });
        return {
          filename: `catequizandos-${year}.csv`,
          header: [
            "Nome",
            "Data de nascimento",
            "Etapa e ano",
            "Turma",
            "Encarregado",
            "Nº de matrícula",
            "Estado",
          ],
          rows: items.map((item) => [
            item.fullName,
            dmy(item.birthDate),
            formatLevel(item.level),
            item.classLabel,
            item.guardianName ?? "Inscrição própria",
            item.enrollmentCode,
            ENROLLMENT_STATUS_LABEL[item.status],
          ]),
        };
      }
      case "classes": {
        const classes = await this.listClasses.execute({ centerId });
        return {
          filename: `turmas-${year}.csv`,
          header: ["Turma", "Horário", "Sala", "Catequistas", "Inscritos", "Capacidade"],
          rows: classes.map((item) => [
            `${formatLevel(item.level)} — Turma ${item.section}`,
            [SLOT_LABEL[item.slot], item.startTime].filter(Boolean).join(" · "),
            item.room,
            item.catechists
              .map(
                (person) =>
                  `${person.fullName} (${person.role === "LEAD" ? "principal" : "auxiliar"})`,
              )
              .join(", "),
            item.members,
            item.capacity,
          ]),
        };
      }
      case "catechist-attendance": {
        const days = await this.sessionDays.execute();
        const sessions = await Promise.all(
          days.map(async (day) => ({
            date: day.date,
            rows: await this.session.execute({ date: day.date }),
          })),
        );
        return {
          filename: `presencas-catequistas-${year}.csv`,
          header: [
            "Encontro",
            "Turma",
            "Catequista",
            "Presença",
            "Chamada lançada",
            "Presentes",
            "Total",
          ],
          rows: sessions
            .sort((a, b) => b.date.localeCompare(a.date))
            .flatMap(({ date, rows }) =>
              rows.map((row) => [
                dmy(date),
                `${formatLevel(row.class.level)} — Turma ${row.class.section}`,
                row.class.catechists.find((person) => person.role === "LEAD")?.fullName,
                row.catechistPresence ? ATTENDANCE_LABEL[row.catechistPresence] : undefined,
                row.rollMarked ? "Sim" : "Não",
                row.rollMarked ? row.present : undefined,
                row.rollMarked ? row.total : undefined,
              ]),
            ),
        };
      }
      case "payments": {
        if (!canSeeFinance) throw new ReportNotAllowedError();
        const enrollments = (
          await this.enrollments.list({ catecheticalYear: calendar.label })
        ).filter((item) => matchesCenter(item.centerId, centerId));
        const payments = await this.ledger.listForEnrollments(
          enrollments.map((item) => item.id.value),
        );
        return {
          filename: `pagamentos-${year}.csv`,
          header: [
            "Nº de matrícula",
            "Catequizando",
            "Tipo",
            "Montante (Kz)",
            "Método",
            "Estado",
            "Pago a",
          ],
          rows: payments
            .sort((a, b) => a.catechumenName.localeCompare(b.catechumenName, "pt"))
            .map((item) => [
              item.enrollmentCode,
              item.catechumenName,
              item.purpose === "ENROLLMENT" ? "Matrícula" : "Confirmação",
              item.amount,
              item.method ? PAYMENT_METHOD_LABEL[item.method] : undefined,
              PAYMENT_STATUS_LABEL[item.status],
              item.paidAt ? dmy(item.paidAt) : undefined,
            ]),
        };
      }
    }
  }
}
