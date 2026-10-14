import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { attendanceTotals } from "../../../domain/class-attendance.js";
import { luandaToday } from "../../../domain/dates.js";
import { CatechumenNotFoundError } from "../../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { toClassViews, toEnrollmentView, type CatechumenProfileView } from "../../views.js";

/** Quantas presenças recentes mostrar no perfil. */
const RECENT = 12;

/** Perfil de um educando (ou do próprio adulto): matrícula, turma e presenças do ano. */
export class GetCatechumenProfileUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly attendance: AttendanceRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({
    accountId,
    catechumenId,
  }: {
    accountId: string;
    catechumenId: string;
  }): Promise<CatechumenProfileView> {
    const catechumen = await this.catechumens.findById(UniqueId.from(catechumenId));
    // Sem acesso responde como se não existisse (não revela ids de outras famílias).
    if (!catechumen?.isAccessibleBy(accountId)) throw new CatechumenNotFoundError();

    const calendar = await this.calendars.get();
    const enrollment = (await this.enrollments.listForCatechumens([catechumenId]))
      .filter((item) => !calendar || item.catecheticalYear === calendar.label)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
    if (!enrollment)
      throw new CatechumenNotFoundError("Sem matrícula no ano catequético em curso.");

    const klass =
      enrollment.isConfirmed && enrollment.classId
        ? await this.classes.findById(UniqueId.from(enrollment.classId))
        : null;
    const [classInfo] = klass
      ? await toClassViews([klass], this.people, calendar, luandaToday(this.clock.now()))
      : [];
    const entries = klass
      ? await this.attendance.listForCatechumen(klass.id.value, catechumenId)
      : [];

    return {
      id: catechumen.id.value,
      fullName: catechumen.fullName,
      birthDate: catechumen.birthDate,
      gender: catechumen.gender,
      baptized: catechumen.baptized,
      firstCommunion: catechumen.firstCommunion,
      self: catechumen.accountId === accountId,
      enrollment: toEnrollmentView(enrollment, catechumen.fullName),
      classInfo,
      attendance: klass
        ? {
            catecheticalYear: enrollment.catecheticalYear,
            ...attendanceTotals(entries),
            recent: [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT),
          }
        : null,
    };
  }
}
