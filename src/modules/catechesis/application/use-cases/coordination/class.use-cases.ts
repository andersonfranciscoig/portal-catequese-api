import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { CatechesisLevel, SessionSlot } from "../../../domain/catechesis.js";
import { CatechesisClass, type ClassCatechist } from "../../../domain/catechesis-class.js";
import { luandaToday } from "../../../domain/dates.js";
import {
  CalendarNotDefinedError,
  ClassAlreadyExistsError,
  ClassNotFoundError,
  InvalidClassError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { classLabel, classSchedule } from "../../messages.js";
import { toClassViews, type ClassView } from "../../views.js";

export interface CoordinationClassView extends ClassView {
  /** Catequizandos com matrícula confirmada. */
  members: number;
}

async function withMembers(
  views: ClassView[],
  enrollments: EnrollmentRepository,
): Promise<CoordinationClassView[]> {
  const counts = await Promise.all(views.map((view) => enrollments.countConfirmedInClass(view.id)));
  return views.map((view, index) => ({ ...view, members: counts[index] }));
}

/** Turmas do ano em curso. */
export class ListClassesUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<CoordinationClassView[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const classes = await this.classes.listByYear(calendar.label);
    const views = await toClassViews(classes, this.people, calendar, luandaToday(this.clock.now()));
    return withMembers(views, this.enrollments);
  }
}

export interface CreateClassInput {
  actorId: string;
  level: CatechesisLevel;
  section: string;
  slot: SessionSlot;
  startTime?: string;
  room: string;
  capacity: number;
}

export class CreateClassUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, ...input }: CreateClassInput): Promise<CoordinationClassView> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const klass = CatechesisClass.create({
      ...input,
      catecheticalYear: calendar.label,
      now: this.clock.now(),
    });
    if (await this.classes.exists(calendar.label, klass.level, klass.section)) {
      throw new ClassAlreadyExistsError();
    }
    await this.classes.save(klass);
    await this.activity.record({
      actorId,
      category: "SETTINGS",
      action: "catechesis.class_created",
      summary: `Criou a turma ${classLabel(klass)} (${calendar.label})`,
    });
    const [view] = await toClassViews(
      [klass],
      this.people,
      calendar,
      luandaToday(this.clock.now()),
    );
    return { ...view, members: 0 };
  }
}

export interface AssignCatechistsInput {
  actorId: string;
  classId: string;
  catechists: ClassCatechist[];
}

/** Define os catequistas da turma (todos aprovados e sem outra turma no mesmo ano). */
export class AssignCatechistsUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute({
    actorId,
    classId,
    catechists,
  }: AssignCatechistsInput): Promise<CoordinationClassView> {
    const klass = await this.classes.findById(UniqueId.from(classId));
    if (!klass) throw new ClassNotFoundError();
    const people = await this.people.findMany(catechists.map((item) => item.accountId));
    if (
      people.length !== new Set(catechists.map((item) => item.accountId)).size ||
      people.some((person) => !person.approvedCatechist || !person.active)
    ) {
      throw new InvalidClassError("Só pode atribuir catequistas aprovados e com a conta ativa.");
    }
    for (const item of catechists) {
      const other = await this.classes.findForCatechist(item.accountId, klass.catecheticalYear);
      if (other && !other.id.equals(klass.id)) {
        const name = people.find((person) => person.id === item.accountId)?.fullName;
        throw new InvalidClassError(`${name ?? "Este catequista"} já tem outra turma neste ano.`);
      }
    }
    const before = klass.catechists.map((item) => item.accountId);
    klass.assignCatechists(catechists);
    await this.classes.save(klass);
    await this.activity.record({
      actorId,
      category: "CATECHISTS",
      action: "catechesis.class_catechists_changed",
      summary: `Atribuiu catequistas a ${classLabel(klass)}: ${people.map((person) => person.fullName).join(", ") || "nenhum"}`,
    });
    const after = catechists.map((item) => item.accountId);
    await this.notifier.notify({
      to: { accountIds: after.filter((id) => !before.includes(id)) },
      kind: "catechesis.class_assigned",
      title: "Foi-lhe atribuída uma turma",
      body: `${classLabel(klass)} · ${classSchedule(klass)}`,
      link: "/portal/turma",
      exceptAccountId: actorId,
    });
    await this.notifier.notify({
      to: { accountIds: before.filter((id) => !after.includes(id)) },
      kind: "catechesis.class_unassigned",
      title: `Deixou de acompanhar ${classLabel(klass)}`,
      body: "A coordenação alterou os catequistas da turma.",
      link: "/portal",
      exceptAccountId: actorId,
    });
    const calendar = await this.calendars.get();
    const views = await toClassViews([klass], this.people, calendar, luandaToday(this.clock.now()));
    return (await withMembers(views, this.enrollments))[0];
  }
}
