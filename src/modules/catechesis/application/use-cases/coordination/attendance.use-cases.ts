import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { CoordinationMessenger } from "../../../../../shared/application/coordination-messenger.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { AttendanceStatus, SessionSlot } from "../../../domain/catechesis.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import { luandaToday } from "../../../domain/dates.js";
import { sessionDayLabel } from "../../../domain/roll-deadline.js";
import {
  CalendarNotDefinedError,
  ClassNotFoundError,
  InvalidSessionDateError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechistPresenceRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { assertSameCenter, matchesCenter, type CenterScope } from "../../center-scope.js";
import { classLabel, classShortLabel } from "../../messages.js";
import { toClassViews } from "../../views.js";
import type { CoordinationClassView } from "./class.use-cases.js";

const SLOTS: SessionSlot[] = ["SATURDAY_MORNING", "SATURDAY_AFTERNOON", "SUNDAY_AFTER_MASS"];

/** Dias com encontros já realizados no ano (mais recentes primeiro), com os períodos. */
export class ListSessionDaysUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ date: string; slots: SessionSlot[] }[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const today = luandaToday(this.clock.now());
    const days = new Map<string, SessionSlot[]>();
    for (const slot of SLOTS) {
      for (const date of calendar.sessionDates(slot, today)) {
        days.set(date, [...(days.get(date) ?? []), slot]);
      }
    }
    return [...days.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, slots]) => ({ date, slots }));
  }
}

export interface SessionClassView {
  class: CoordinationClassView;
  catechistPresence: AttendanceStatus | null;
  rollMarked: boolean;
  present: number;
  total: number;
}

/** Um dia de encontros: cada turma, a chamada e a presença do catequista. */
export class GetSessionUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly attendance: AttendanceRepository,
    private readonly presence: CatechistPresenceRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly clock: Clock,
  ) {}

  async execute({ date, centerId }: { date: string; centerId?: string }): Promise<SessionClassView[]> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const classes = (await this.classes.listByYear(calendar.label)).filter(
      (klass) => calendar.isSessionDate(klass.slot, date) && matchesCenter(klass.centerId, centerId),
    );
    const [views, presence] = await Promise.all([
      toClassViews(classes, this.people, calendar, luandaToday(this.clock.now())),
      this.presence.listForDate(date),
    ]);
    return Promise.all(
      classes.map(async (klass, index) => {
        const [members, sheets] = await Promise.all([
          this.enrollments.countConfirmedInClass(klass.id.value),
          this.attendance.listForClass(klass.id.value),
        ]);
        const sheet = sheets.find((item) => item.date === date);
        return {
          class: { ...views[index], members },
          catechistPresence:
            presence.find((item) => item.classId === klass.id.value)?.status ?? null,
          rollMarked: Boolean(sheet),
          present: sheet?.marks.filter((mark) => mark.status === "PRESENT").length ?? 0,
          total: sheet?.marks.length ?? members,
        };
      }),
    );
  }
}

/** O que o catequista principal lê quando a coordenação regista a sua presença. */
export function catechistPresenceText(
  status: AttendanceStatus,
  date: string,
  classLabel: string,
): { title: string; body: string } {
  const day = sessionDayLabel(date);
  const session = `no encontro de ${day} (${classLabel})`;
  switch (status) {
    case "PRESENT":
      return { title: `Presença registada: ${day}`, body: `Registei a tua presença ${session}.` };
    case "ABSENT":
      return {
        title: `Falta registada: ${day}`,
        body: `Registei uma falta tua ${session}. Se houver engano ou motivo, responde a esta mensagem.`,
      };
    case "JUSTIFIED":
      return {
        title: `Falta justificada: ${day}`,
        body: `Registei a tua falta como justificada ${session}.`,
      };
  }
}

/**
 * A coordenação regista se o catequista esteve no encontro. Quando o estado é
 * novo ou mudou, o catequista principal recebe uma mensagem no chat (em nome
 * de quem registou), uma notificação e um email. Gravar o mesmo estado outra
 * vez não repete os avisos.
 */
export class SetCatechistPresenceUseCase {
  constructor(
    private readonly classes: ClassRepository,
    private readonly presence: CatechistPresenceRepository,
    private readonly calendars: CalendarRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    private readonly messenger: CoordinationMessenger,
  ) {}

  async execute({
    actorId,
    classId,
    date,
    status,
    scope,
  }: {
    actorId: string;
    classId: string;
    date: string;
    status: AttendanceStatus;
    scope?: CenterScope;
  }): Promise<void> {
    const klass = await this.classes.findById(UniqueId.from(classId));
    if (!klass) throw new ClassNotFoundError();
    assertSameCenter(scope, klass.centerId);
    const calendar = await this.calendars.get();
    const now = this.clock.now();
    if (!calendar?.isSessionDate(klass.slot, date) || date > luandaToday(now)) {
      throw new InvalidSessionDateError("Este dia não é um encontro já realizado desta turma.");
    }
    const previous = (await this.presence.listForClasses([classId])).find(
      (item) => item.date === date,
    );
    await this.presence.save({ classId, date, status, recordedBy: actorId, recordedAt: now });
    await this.activity.record({
      actorId,
      category: "CATECHISTS",
      action: "catechesis.catechist_presence",
      summary: `Registou a presença do catequista de ${classLabel(klass)} a ${date.split("-").reverse().join("/")}`,
    });
    if (previous?.status !== status) await this.notifyLeads(actorId, klass, date, status);
  }

  /** Mensagem no chat (em nome de quem registou), notificação e email a cada principal. */
  private async notifyLeads(
    actorId: string,
    klass: CatechesisClass,
    date: string,
    status: AttendanceStatus,
  ) {
    const { title, body } = catechistPresenceText(status, date, classShortLabel(klass));
    const leads = klass.catechists
      .filter((item) => item.role === "LEAD" && item.accountId !== actorId)
      .map((item) => item.accountId);
    for (const accountId of leads) {
      let link = "/portal";
      try {
        const { conversationId } = await this.messenger.post({
          toAccountId: accountId,
          fromAccountId: actorId,
          body,
          centerId: klass.centerId,
        });
        link = `/portal/mensagens?c=${conversationId}`;
      } catch {
        // Sem chat, a notificação e o email chegam na mesma.
      }
      await this.notifier.notify({
        to: { accountIds: [accountId] },
        kind: "catechesis.catechist_presence",
        title,
        body,
        link,
      });
    }
  }
}
