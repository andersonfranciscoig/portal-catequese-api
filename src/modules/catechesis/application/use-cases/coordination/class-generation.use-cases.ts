import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { formatLevel, type CatechesisLevel, type SessionSlot } from "../../../domain/catechesis.js";
import { CatechesisClass } from "../../../domain/catechesis-class.js";
import { catechistStatus } from "../../../domain/catechist-records.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import {
  CalendarNotDefinedError,
  InvalidClassError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechistProfileRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { EnrollmentActionUseCase } from "./enrollment.use-cases.js";

export interface GenerationPlanView {
  level: CatechesisLevel;
  /** Confirmados mais os aprovados à espera de turma. */
  catechumens: number;
  waiting: number;
  capacity: number;
  /** Tamanho de cada turma, equilibrado (ex.: [24, 24, 24]). */
  sizes: number[];
  existing: number;
  availableCatechists: number;
  slot: SessionSlot;
}

/** Divide `total` em `count` partes o mais iguais possível. */
function balance(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0));
}

/** Crisma é à tarde (adolescentes); o resto, de manhã. */
function defaultSlot(level: CatechesisLevel): SessionSlot {
  return level.startsWith("CONFIRMATION") ? "SATURDAY_AFTERNOON" : "SATURDAY_MORNING";
}

const START_TIME: Record<SessionSlot, string | undefined> = {
  SATURDAY_MORNING: "08:00",
  SATURDAY_AFTERNOON: "15:00",
  SUNDAY_AFTER_MASS: undefined,
};

/**
 * Turmas de um nível: quantas são precisas para os catequizandos (confirmados
 * e aprovados à espera de turma) e os catequistas disponíveis.
 */
export class ClassGeneration {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly calendars: CalendarRepository,
    private readonly profiles: CatechistProfileRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async context(level: CatechesisLevel) {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const year = calendar.label;
    const [all, classes, catechists, profiles] = await Promise.all([
      this.enrollments.list({ catecheticalYear: year }),
      this.classes.listByYear(year),
      this.people.listCatechists(),
      this.profiles.list(),
    ]);
    const ofLevel = all.filter((item) => item.level === level);
    const waiting = ofLevel
      .filter((item) => item.status === "APPROVED" && !item.classId)
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
    const confirmed = ofLevel.filter((item) => item.isConfirmed);
    const busy = new Set(
      classes.flatMap((klass) => klass.catechists.map((item) => item.accountId)),
    );
    const statusOf = new Map(profiles.map((profile) => [profile.accountId, profile]));
    // Disponíveis: aprovados, ativos, sem turma no ano e sem estado que os afaste.
    const available = catechists.filter(
      (person) =>
        person.approvedCatechist &&
        person.active &&
        !busy.has(person.id) &&
        catechistStatus(statusOf.get(person.id), false) === "AVAILABLE",
    );
    return {
      year,
      waiting,
      confirmed,
      levelClasses: classes.filter((klass) => klass.level === level),
      available,
    };
  }
}

export class PlanClassesUseCase {
  constructor(private readonly generation: ClassGeneration) {}

  async execute({
    level,
    capacity,
  }: {
    level: CatechesisLevel;
    capacity: number;
  }): Promise<GenerationPlanView> {
    if (!Number.isInteger(capacity) || capacity < 5 || capacity > 100) {
      throw new InvalidClassError("A lotação tem de ser entre 5 e 100.");
    }
    const { waiting, confirmed, levelClasses, available } = await this.generation.context(level);
    const total = waiting.length + confirmed.length;
    const count = Math.max(levelClasses.length, Math.ceil(total / capacity), 1);
    return {
      level,
      catechumens: total,
      waiting: waiting.length,
      capacity,
      sizes: balance(total, count),
      existing: levelClasses.length,
      availableCatechists: available.length,
      slot: levelClasses[0]?.slot ?? defaultSlot(level),
    };
  }
}

export interface GenerationResult {
  created: number;
  placed: number;
  assigned: number;
}

/**
 * Gera as turmas que faltam num nível, coloca os aprovados à espera de turma
 * (por ordem de chegada, nas turmas com mais lugares livres) e atribui
 * catequistas disponíveis às turmas sem catequista. Não mexe nas turmas nem
 * nos catequizandos que já estão colocados.
 */
export class GenerateClassesUseCase {
  constructor(
    private readonly generation: ClassGeneration,
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly confirm: EnrollmentActionUseCase,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({
    actorId,
    level,
    capacity,
    slot,
  }: {
    actorId: string;
    level: CatechesisLevel;
    capacity: number;
    slot: SessionSlot;
  }): Promise<GenerationResult> {
    if (!Number.isInteger(capacity) || capacity < 5 || capacity > 100) {
      throw new InvalidClassError("A lotação tem de ser entre 5 e 100.");
    }
    const { year, waiting, confirmed, levelClasses, available } =
      await this.generation.context(level);
    const total = waiting.length + confirmed.length;
    const needed = Math.max(Math.ceil(total / capacity), 1) - levelClasses.length;
    const now = this.clock.now();

    const used = new Set(levelClasses.map((klass) => klass.section));
    const created: CatechesisClass[] = [];
    for (let code = 65; created.length < needed && code <= 90; code++) {
      const section = String.fromCharCode(code);
      if (used.has(section)) continue;
      const klass = CatechesisClass.create({
        catecheticalYear: year,
        level,
        section,
        slot,
        startTime: START_TIME[slot],
        room: "Sala a definir",
        capacity,
        now,
      });
      await this.classes.save(klass);
      created.push(klass);
    }

    const classes = [...levelClasses, ...created];
    // Catequistas disponíveis nas turmas sem catequista.
    let assigned = 0;
    const pool = [...available];
    for (const klass of classes) {
      if (klass.catechists.length || !pool.length) continue;
      klass.assignCatechists([{ accountId: pool.shift()!.id, role: "LEAD" }]);
      await this.classes.save(klass);
      assigned++;
    }

    // Aprovados à espera de turma: na turma com mais lugares livres.
    const occupied = new Map<string, number>();
    for (const klass of classes) {
      occupied.set(klass.id.value, await this.enrollments.countConfirmedInClass(klass.id.value));
    }
    let placed = 0;
    for (const enrollment of waiting as Enrollment[]) {
      const target = classes
        .filter((klass) => occupied.get(klass.id.value)! < klass.capacity)
        .sort(
          (a, b) =>
            a.capacity - occupied.get(a.id.value)! - (b.capacity - occupied.get(b.id.value)!),
        )
        .at(-1);
      if (!target) break;
      await this.confirm.execute({
        actorId,
        enrollmentId: enrollment.id.value,
        action: { kind: "confirm", classId: target.id.value },
      });
      occupied.set(target.id.value, occupied.get(target.id.value)! + 1);
      placed++;
    }

    await this.activity.record({
      actorId,
      category: "SETTINGS",
      action: "catechesis.classes_generated",
      summary: `Gerou turmas de ${formatLevel(level)}: ${created.length} nova(s), ${placed} catequizando(s) colocado(s), ${assigned} catequista(s) atribuído(s)`,
    });
    return { created: created.length, placed, assigned };
  }
}
