import type { EventBus } from "../../../../../shared/application/event-bus.js";
import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import {
  ADULT_AGE,
  formatLevel,
  slotRequirement,
  type CatechesisLevel,
  type EnrollmentType,
  type Gender,
  type GuardianRelationship,
  type SessionSlot,
} from "../../../domain/catechesis.js";
import { Catechumen } from "../../../domain/catechumen.js";
import { ageAt, isIsoDate, luandaToday } from "../../../domain/dates.js";
import { Enrollment } from "../../../domain/enrollment.js";
import { EnrollmentSubmitted } from "../../../domain/events/enrollment-submitted.js";
import {
  CalendarNotDefinedError,
  EnrollmentAlreadyExistsError,
  InvalidEnrollmentError,
  NotAnApplicantError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechumenRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechesisAccess } from "../../catechesis-access.js";
import type { EnrollmentCodes } from "../../enrollment-codes.js";
import { toEnrollmentView, type EnrollmentView } from "../../views.js";

export interface SubmitEnrollmentInput {
  accountId: string;
  /** Presente nas inscrições de menores (feitas pelo encarregado). */
  guardian?: { relationship: GuardianRelationship };
  catechumen: {
    fullName: string;
    birthDate: string;
    gender: Gender;
    address?: string;
    sacraments: { baptism: boolean; firstCommunion: boolean };
  };
  catechesis: {
    type: EnrollmentType;
    level: CatechesisLevel;
    preferredSlot: SessionSlot;
    previousParish?: string;
    notes?: string;
  };
  /** A família entrega os documentos em papel na secretaria (em vez de os anexar). */
  documentsInPerson?: boolean;
}

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").localeCompare(b.trim().replace(/\s+/g, " "), "pt", {
    sensitivity: "base",
  }) === 0;

/**
 * Matrícula feita no portal: o encarregado inscreve um educando menor; o adulto
 * inscreve-se a si próprio. Um catequizando já conhecido é reaproveitado.
 */
export class SubmitEnrollmentUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly calendars: CalendarRepository,
    private readonly access: CatechesisAccess,
    private readonly codes: EnrollmentCodes,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    private readonly events: EventBus,
  ) {}

  async execute({
    accountId,
    guardian,
    catechumen: data,
    catechesis,
    documentsInPerson,
  }: SubmitEnrollmentInput): Promise<EnrollmentView> {
    const person = await this.access.applicant(accountId);
    const forChild = Boolean(guardian);
    if (!person.roles.includes(forChild ? "GUARDIAN" : "CATECHUMEN"))
      throw new NotAnApplicantError();

    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const now = this.clock.now();
    const today = luandaToday(now);
    if (!isIsoDate(data.birthDate) || data.birthDate >= today) {
      throw new InvalidEnrollmentError("A data de nascimento não é válida.");
    }
    const age = ageAt(data.birthDate, today);
    if (forChild && age >= ADULT_AGE) {
      throw new InvalidEnrollmentError("Com 18 anos ou mais, a pessoa inscreve-se a si própria.");
    }
    if (!forChild && age < ADULT_AGE) {
      throw new InvalidEnrollmentError("Menores de 18 anos são inscritos pelo encarregado.");
    }
    const slotProblem = slotRequirement(catechesis.preferredSlot, age);
    if (slotProblem) throw new InvalidEnrollmentError(slotProblem);

    const known = await this.catechumens.findAccessibleBy(accountId);
    const existing = forChild
      ? known.find(
          (item) =>
            item.guardianAccountId === accountId &&
            item.birthDate === data.birthDate &&
            sameName(item.fullName, data.fullName),
        )
      : known.find((item) => item.accountId === accountId);
    const sacraments = {
      address: data.address,
      baptized: data.sacraments.baptism,
      firstCommunion: data.sacraments.firstCommunion,
    };
    let catechumen: Catechumen;
    if (existing) {
      existing.update(sacraments, now);
      catechumen = existing;
    } else {
      catechumen = Catechumen.register({
        ...sacraments,
        fullName: data.fullName,
        birthDate: data.birthDate,
        gender: data.gender,
        guardianAccountId: forChild ? accountId : undefined,
        guardianRelationship: guardian?.relationship,
        accountId: forChild ? undefined : accountId,
        now,
      });
    }

    if (await this.enrollments.findForCatechumen(catechumen.id.value, calendar.label)) {
      throw new EnrollmentAlreadyExistsError();
    }
    const enrollment = Enrollment.submit({
      ...catechesis,
      code: await this.codes.next(Number(calendar.label.slice(0, 4))),
      catechumenId: catechumen.id.value,
      catecheticalYear: calendar.label,
      submittedBy: accountId,
      documentsInPerson,
      now,
    });
    await this.catechumens.save(catechumen);
    await this.enrollments.save(enrollment);
    await this.events.publish([new EnrollmentSubmitted(enrollment, catechumen)]);
    await this.activity.record({
      actorId: accountId,
      category: "ENROLLMENT",
      action: "catechesis.enrollment_submitted",
      summary: `Submeteu a matrícula de ${catechumen.fullName} (${enrollment.code})`,
    });
    await this.notifier.notify({
      to: { permission: "COORDINATION" },
      kind: "catechesis.enrollment_submitted",
      title: "Nova matrícula para analisar",
      body: `${catechumen.fullName} · ${formatLevel(enrollment.level)} (${enrollment.code})`,
      link: `/dashboard/matriculas?matricula=${enrollment.id.value}`,
      exceptAccountId: accountId,
    });
    return toEnrollmentView(enrollment, catechumen.fullName);
  }
}
