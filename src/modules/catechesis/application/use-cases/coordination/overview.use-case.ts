import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { CatechesisLevel, EnrollmentStatus } from "../../../domain/catechesis.js";
import { addDays, luandaToday } from "../../../domain/dates.js";
import { matchesCenter } from "../../center-scope.js";
import { CalendarNotDefinedError } from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";

export type ActivityKind = "NEW_ENROLLMENT" | "RENEWAL" | "CONFIRMED" | "WAITLIST";

export interface OverviewView {
  catecheticalYear: string;
  stats: {
    catechumens: number;
    confirmed: number;
    underReview: number;
    catechists: number;
    activeCatechists: number;
    newThisWeek: number;
  };
  /** Matrículas por dia, desde a primeira do ano até hoje. */
  trend: { date: string; daily: number; total: number }[];
  /** Matrículas ativas por nível. */
  levels: { level: CatechesisLevel; count: number }[];
  /** Quantos pedem atenção (a interface escreve os textos). */
  attention: {
    review: number;
    approvedWithoutClass: number;
    pendingDocuments: number;
    waitlist: number;
    almostFullClasses: number;
    classesWithoutCatechist: number;
    pendingCatechists: number;
  };
  /** Últimos acontecimentos das matrículas (do histórico). */
  activity: { id: string; kind: ActivityKind; subject: string; at: string }[];
  daysUntilStart: number;
  classes: { total: number; averageOccupancy: number };
}

const ACTIVE: EnrollmentStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "WAITLIST",
];

/** Resumo da coordenação para o ano em curso. */
export class GetOverviewUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({ centerId }: { centerId?: string } = {}): Promise<OverviewView> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const now = this.clock.now();
    const today = luandaToday(now);
    const [all, classes, catechists] = await Promise.all([
      this.enrollments.list({ catecheticalYear: calendar.label }),
      this.classes.listByYear(calendar.label),
      this.people.listCatechists(),
    ]);
    const scopedAll = all.filter((item) => matchesCenter(item.centerId, centerId));
    const scopedClasses = classes.filter((item) => matchesCenter(item.centerId, centerId));
    const active = scopedAll.filter((item) => ACTIVE.includes(item.status));
    const count = (...statuses: EnrollmentStatus[]) =>
      scopedAll.filter((item) => statuses.includes(item.status)).length;
    const day = (date: Date) => luandaToday(date);

    // Evolução diária das matrículas.
    const perDay = new Map<string, number>();
    for (const item of scopedAll)
      perDay.set(day(item.submittedAt), (perDay.get(day(item.submittedAt)) ?? 0) + 1);
    const trend: OverviewView["trend"] = [];
    const first = [...perDay.keys()].sort()[0];
    let total = 0;
    for (let date = first; date && date <= today; date = addDays(date, 1)) {
      total += perDay.get(date) ?? 0;
      trend.push({ date, daily: perDay.get(date) ?? 0, total });
    }

    const levels = new Map<CatechesisLevel, number>();
    for (const item of active) levels.set(item.level, (levels.get(item.level) ?? 0) + 1);

    const occupancy = await Promise.all(
      scopedClasses.map(async (klass) => ({
        klass,
        ratio: (await this.enrollments.countConfirmedInClass(klass.id.value)) / klass.capacity,
      })),
    );
    const approved = catechists.filter((person) => person.catechistApproval === "APPROVED");
    const busy = new Set(
      scopedClasses.flatMap((klass) => klass.catechists.map((item) => item.accountId)),
    );

    // Atividade: as mudanças de estado mais recentes.
    const names = new Map(
      (await this.catechumens.findByIds(scopedAll.map((item) => item.catechumenId))).map((item) => [
        item.id.value,
        item.fullName,
      ]),
    );
    const activity = scopedAll
      .flatMap((enrollment) =>
        enrollment.history.flatMap((event, index) => {
          const kind: ActivityKind | null =
            event.status === "CONFIRMED"
              ? "CONFIRMED"
              : event.status === "WAITLIST"
                ? "WAITLIST"
                : index === 0
                  ? enrollment.type === "RENEWAL"
                    ? "RENEWAL"
                    : "NEW_ENROLLMENT"
                  : null;
          return kind
            ? [
                {
                  id: `${enrollment.id.value}-${index}`,
                  kind,
                  subject: names.get(enrollment.catechumenId) ?? "—",
                  at: event.at.toISOString(),
                },
              ]
            : [];
        }),
      )
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);

    const weekAgo = addDays(today, -7);
    return {
      catecheticalYear: calendar.label,
      stats: {
        catechumens: active.length,
        confirmed: count("CONFIRMED"),
        underReview: count("SUBMITTED", "UNDER_REVIEW"),
        catechists: approved.length,
        activeCatechists: approved.filter((person) => busy.has(person.id)).length,
        newThisWeek: scopedAll.filter((item) => day(item.submittedAt) > weekAgo).length,
      },
      trend,
      levels: [...levels.entries()].map(([level, value]) => ({ level, count: value })),
      attention: {
        review: count("SUBMITTED", "UNDER_REVIEW"),
        approvedWithoutClass: scopedAll.filter((item) => item.status === "APPROVED" && !item.classId)
          .length,
        pendingDocuments: count("PENDING_CONFIRMATION"),
        waitlist: count("WAITLIST"),
        almostFullClasses: occupancy.filter((item) => item.ratio >= 0.9).length,
        classesWithoutCatechist: scopedClasses.filter((klass) => !klass.catechists.length).length,
        pendingCatechists: catechists.filter((person) => person.catechistApproval === "PENDING")
          .length,
      },
      activity,
      daysUntilStart: Math.max(
        0,
        Math.round(
          (Date.parse(`${calendar.startsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
            86_400_000,
        ),
      ),
      classes: {
        total: scopedClasses.length,
        averageOccupancy: occupancy.length
          ? Math.round(
              (occupancy.reduce((sum, item) => sum + item.ratio, 0) / occupancy.length) * 100,
            )
          : 0,
      },
    };
  }
}
