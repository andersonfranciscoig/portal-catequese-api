import type { Clock } from "../../../shared/domain/clock.js";
import type { CatecheticalCalendar } from "../domain/catechetical-calendar.js";
import type { CatechesisClass } from "../domain/catechesis-class.js";
import type { Catechumen } from "../domain/catechumen.js";
import { luandaToday } from "../domain/dates.js";
import {
  CalendarNotDefinedError,
  NoClassAssignedError,
} from "../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../domain/repositories/catechesis.repositories.js";
import type { CatechesisAccess } from "./catechesis-access.js";

export interface CatechistClass {
  calendar: CatecheticalCalendar;
  klass: CatechesisClass;
  /** Catequizandos com matrícula confirmada, por ordem alfabética. */
  members: Catechumen[];
  today: string;
}

/**
 * A turma do catequista no ano em curso (o portal do catequista trabalha só com
 * ela): confirma que é catequista aprovado e que a turma lhe está atribuída.
 */
export class CatechistClassResolver {
  constructor(
    private readonly access: CatechesisAccess,
    private readonly calendars: CalendarRepository,
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly clock: Clock,
  ) {}

  /** `null` quando ainda não tem turma (o portal mostra isso). */
  async find(
    accountId: string,
  ): Promise<CatechistClass | { calendar: CatecheticalCalendar; klass: null }> {
    await this.access.catechist(accountId);
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const klass = await this.classes.findForCatechist(accountId, calendar.label);
    if (!klass) return { calendar, klass: null };
    const enrolled = await this.enrollments.listConfirmedInClass(klass.id.value);
    const members = (
      await this.catechumens.findByIds(enrolled.map((item) => item.catechumenId))
    ).sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
    return { calendar, klass, members, today: luandaToday(this.clock.now()) };
  }

  async require(accountId: string): Promise<CatechistClass> {
    const found = await this.find(accountId);
    if (!found.klass) throw new NoClassAssignedError();
    return found;
  }
}
