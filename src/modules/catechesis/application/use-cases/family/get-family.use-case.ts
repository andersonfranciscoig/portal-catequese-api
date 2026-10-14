import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { luandaToday } from "../../../domain/dates.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import type {
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import {
  toClassViews,
  toEnrollmentView,
  type CatechumenCardView,
  type FamilyView,
} from "../../views.js";

const newestFirst = (a: Enrollment, b: Enrollment) =>
  b.submittedAt.getTime() - a.submittedAt.getTime();

/**
 * Portal da família: os educandos (ou o próprio adulto) com a matrícula do ano
 * em curso e a turma, e todas as matrículas.
 */
export class GetFamilyUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({ accountId }: { accountId: string }): Promise<FamilyView> {
    const [calendar, catechumens] = await Promise.all([
      this.calendars.get(),
      this.catechumens.findAccessibleBy(accountId),
    ]);
    const names = new Map(catechumens.map((item) => [item.id.value, item.fullName]));
    const enrollments = (await this.enrollments.listForCatechumens([...names.keys()])).sort(
      newestFirst,
    );
    const year = calendar?.label;
    // A matrícula do ano em curso (sem calendário definido, a mais recente).
    const current = new Map<string, Enrollment>();
    for (const enrollment of enrollments) {
      if (
        (!year || enrollment.catecheticalYear === year) &&
        !current.has(enrollment.catechumenId)
      ) {
        current.set(enrollment.catechumenId, enrollment);
      }
    }
    const classIds = [...current.values()].flatMap((item) =>
      item.isConfirmed && item.classId ? [item.classId] : [],
    );
    const classes = new Map(
      (
        await toClassViews(
          await this.classes.findByIds(classIds),
          this.people,
          calendar,
          luandaToday(this.clock.now()),
        )
      ).map((view) => [view.id, view]),
    );

    const children: CatechumenCardView[] = catechumens.flatMap((catechumen) => {
      const enrollment = current.get(catechumen.id.value);
      if (!enrollment) return [];
      return [
        {
          id: catechumen.id.value,
          fullName: catechumen.fullName,
          enrollment: toEnrollmentView(enrollment, catechumen.fullName),
          classInfo:
            enrollment.isConfirmed && enrollment.classId
              ? classes.get(enrollment.classId)
              : undefined,
        },
      ];
    });

    return {
      catecheticalYear: year ?? "",
      children: children.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt")),
      enrollments: enrollments.map((item) =>
        toEnrollmentView(item, names.get(item.catechumenId) ?? "—"),
      ),
    };
  }
}
