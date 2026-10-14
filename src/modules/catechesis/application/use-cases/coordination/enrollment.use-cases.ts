import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import { formatLevel, type EnrollmentStatus } from "../../../domain/catechesis.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import {
  CalendarNotDefinedError,
  ClassFullError,
  ClassNotFoundError,
  EnrollmentNotFoundError,
  InvalidEnrollmentError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { classLabel, classSchedule, firstName } from "../../messages.js";
import { toEnrollmentView, type EnrollmentView } from "../../views.js";

/** Matrículas do ano em curso (coordenação). */
export class ListEnrollmentsUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly calendars: CalendarRepository,
  ) {}

  async execute({ status }: { status?: EnrollmentStatus }): Promise<EnrollmentView[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const enrollments = await this.enrollments.list({ catecheticalYear: calendar.label, status });
    const names = new Map(
      (await this.catechumens.findByIds(enrollments.map((item) => item.catechumenId))).map(
        (item) => [item.id.value, item.fullName],
      ),
    );
    return enrollments.map((item) => toEnrollmentView(item, names.get(item.catechumenId) ?? "—"));
  }
}

export type EnrollmentDecision =
  { decision: "CONFIRMED"; classId: string } | { decision: "REJECTED" };

/** Confirma a matrícula numa turma do mesmo nível e ano (com lugar), ou recusa-a. */
export class DecideEnrollmentUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute(
    input: { actorId: string; enrollmentId: string } & EnrollmentDecision,
  ): Promise<EnrollmentView> {
    const enrollment = await this.enrollments.findById(UniqueId.from(input.enrollmentId));
    if (!enrollment) throw new EnrollmentNotFoundError();
    const catechumen = await this.catechumens.findById(UniqueId.from(enrollment.catechumenId));
    const name = catechumen?.fullName ?? "—";
    const now = this.clock.now();

    if (input.decision === "CONFIRMED") {
      const klass = await this.classes.findById(UniqueId.from(input.classId));
      if (!klass) throw new ClassNotFoundError();
      if (
        klass.level !== enrollment.level ||
        klass.catecheticalYear !== enrollment.catecheticalYear
      ) {
        throw new InvalidEnrollmentError("A turma tem de ser do mesmo nível e ano da matrícula.");
      }
      if ((await this.enrollments.countConfirmedInClass(klass.id.value)) >= klass.capacity) {
        throw new ClassFullError();
      }
      enrollment.confirm(klass.id.value, input.actorId, now);
      await this.enrollments.save(enrollment);
      await this.activity.record({
        actorId: input.actorId,
        category: "ENROLLMENT",
        action: "catechesis.enrollment_confirmed",
        summary: `Confirmou a matrícula de ${name} (${enrollment.code}) em ${classLabel(klass)}`,
      });
      await this.notifyFamily(enrollment, catechumen, input.actorId, {
        kind: "catechesis.enrollment_confirmed",
        title: `Matrícula de ${firstName(name)} confirmada`,
        body: `${classLabel(klass)} · ${classSchedule(klass)}`,
      });
    } else {
      enrollment.reject(input.actorId, now);
      await this.enrollments.save(enrollment);
      await this.activity.record({
        actorId: input.actorId,
        category: "ENROLLMENT",
        action: "catechesis.enrollment_rejected",
        summary: `Recusou a matrícula de ${name} (${enrollment.code})`,
      });
      await this.notifyFamily(enrollment, catechumen, input.actorId, {
        kind: "catechesis.enrollment_rejected",
        title: `Matrícula de ${firstName(name)} não foi aceite`,
        body: `${formatLevel(enrollment.level)} (${enrollment.code}). Para saber mais, fale com a secretaria da catequese.`,
        link: "/portal/matriculas",
      });
    }
    return toEnrollmentView(enrollment, name);
  }

  /**
   * Avisa quem acompanha o catequizando: o próprio adulto (no seu portal) e o
   * encarregado ou quem submeteu (no perfil do educando).
   */
  private async notifyFamily(
    enrollment: Enrollment,
    catechumen: Catechumen | null,
    actorId: string,
    message: { kind: string; title: string; body: string; link?: string },
  ) {
    const adult = catechumen?.accountId;
    const guardians = [...new Set([catechumen?.guardianAccountId, enrollment.submittedBy])].filter(
      (id): id is string => Boolean(id) && id !== adult,
    );
    if (adult) {
      await this.notifier.notify({
        ...message,
        to: { accountIds: [adult] },
        link: message.link ?? "/portal",
        exceptAccountId: actorId,
      });
    }
    if (guardians.length) {
      await this.notifier.notify({
        ...message,
        to: { accountIds: guardians },
        link: message.link ?? `/portal/educandos/${enrollment.catechumenId}`,
        exceptAccountId: actorId,
      });
    }
  }
}
