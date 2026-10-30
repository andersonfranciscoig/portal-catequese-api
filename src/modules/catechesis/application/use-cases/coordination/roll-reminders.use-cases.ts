import type { CoordinationMessenger } from "../../../../../shared/application/coordination-messenger.js";
import type { Mailer } from "../../../../../shared/application/mailer.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import { addDays, luandaToday } from "../../../domain/dates.js";
import { CalendarNotDefinedError } from "../../../domain/errors/catechesis.errors.js";
import { matchesCenter } from "../../center-scope.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  ClassRepository,
  RollReminderRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import {
  daysSince,
  isRollLate,
  isWithinReminderWindow,
  PENDING_ROLLS_DAYS,
  rollDeadline,
  sessionDayLabel,
} from "../../../domain/roll-deadline.js";
import type { CatechesisAccess } from "../../catechesis-access.js";
import { classShortLabel, firstName } from "../../messages.js";

/** Encontro já com o prazo passado e sem chamada lançada. */
export interface PendingRollView {
  classId: string;
  centerId: string;
  /** "Comunhão · 3.º ano · A" */
  classLabel: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO (23:59:59 de Luanda desse dia). */
  deadline: string;
  daysLate: number;
  catechists: { accountId: string; name: string }[];
  /** Quando o sistema avisou (`null` se ainda não avisou). */
  alertedAt: string | null;
}

/**
 * Chamadas em atraso: encontros do ano (dos últimos 60 dias) cujo prazo — o fim
 * do dia do encontro, hora de Luanda — já passou sem nenhuma presença lançada.
 * Estado atual, calculado a cada pedido (não depende dos alertas).
 */
export class PendingRolls {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly reminders: RollReminderRepository,
    private readonly people: PeopleDirectory,
  ) {}

  /** Mais recentes primeiro. */
  async list(
    calendar: CatecheticalCalendar,
    classes: CatechesisClass[],
    now: Date,
  ): Promise<PendingRollView[]> {
    const today = luandaToday(now);
    const from = addDays(today, -PENDING_ROLLS_DAYS);
    const sessions = classes.flatMap((klass) =>
      calendar
        .sessionDates(klass.slot, today)
        .filter((date) => date >= from && isRollLate(date, now))
        .map((date) => ({ klass, date })),
    );
    if (!sessions.length) return [];
    const classIds = classes.map((klass) => klass.id.value);
    const [marked, reminders] = await Promise.all([
      this.attendance.listRollDates(classIds, from),
      this.reminders.listForClasses(classIds),
    ]);
    const done = new Set(marked.map((item) => `${item.classId}|${item.date}`));
    const missing = sessions.filter(({ klass, date }) => !done.has(`${klass.id.value}|${date}`));
    if (!missing.length) return [];
    const alerted = new Map(
      reminders.map((item) => [`${item.classId}|${item.date}`, item.alertedAt.toISOString()]),
    );
    const people = new Map(
      (
        await this.people.findMany(
          missing.flatMap(({ klass }) => klass.catechists.map((item) => item.accountId)),
        )
      ).map((person) => [person.id, person.fullName]),
    );
    return missing
      .map(({ klass, date }) => ({
        classId: klass.id.value,
        centerId: klass.centerId,
        classLabel: classShortLabel(klass),
        date,
        deadline: rollDeadline(date).toISOString(),
        daysLate: daysSince(date, today),
        // O principal primeiro.
        catechists: [...klass.catechists]
          .sort((a, b) => (a.role === b.role ? 0 : a.role === "LEAD" ? -1 : 1))
          .map((item) => ({
            accountId: item.accountId,
            name: people.get(item.accountId) ?? "Conta removida",
          })),
        alertedAt: alerted.get(`${klass.id.value}|${date}`) ?? null,
      }))
      .sort(
        (a, b) => b.date.localeCompare(a.date) || a.classLabel.localeCompare(b.classLabel, "pt"),
      );
  }
}

/** Coordenação: todas as chamadas em atraso do ano. */
export class ListPendingRollsUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly classes: ClassRepository,
    private readonly pending: PendingRolls,
    private readonly clock: Clock,
  ) {}

  async execute({ centerId }: { centerId?: string } = {}): Promise<{ items: PendingRollView[] }> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const classes = (await this.classes.listByYear(calendar.label)).filter((klass) =>
      matchesCenter(klass.centerId, centerId),
    );
    return { items: await this.pending.list(calendar, classes, this.clock.now()) };
  }
}

/** Catequista: as chamadas em atraso das suas turmas do ano. */
export class ListMyPendingRollsUseCase {
  constructor(
    private readonly access: CatechesisAccess,
    private readonly calendars: CalendarRepository,
    private readonly classes: ClassRepository,
    private readonly pending: PendingRolls,
    private readonly clock: Clock,
  ) {}

  async execute({ accountId }: { accountId: string }): Promise<{ items: PendingRollView[] }> {
    await this.access.catechist(accountId);
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const classes = (await this.classes.listForCatechist(accountId)).filter(
      (klass) => klass.catecheticalYear === calendar.label,
    );
    return { items: await this.pending.list(calendar, classes, this.clock.now()) };
  }
}

/** "Ainda não lançaste a chamada do encontro de sábado, 25/10, da turma …" */
export function rollReminderText(classLabel: string, date: string): string {
  return `Ainda não lançaste a chamada do encontro de ${sessionDayLabel(date)}, da turma ${classLabel}. Lança-a assim que possível.`;
}

export interface RollRemindersResult {
  /** Encontros avisados nesta execução. */
  alerted: PendingRollView[];
  /** O que falhou (email, notificação ou chat); o resto seguiu. */
  failures: string[];
}

/**
 * Alertas de chamada por lançar (corre de 15 em 15 minutos). Para cada encontro
 * cujo prazo passou há menos de 24 horas sem chamada, e ainda não avisado:
 * cada catequista da turma recebe notificação, email e uma mensagem automática
 * na sua conversa com a coordenação; a coordenação recebe um resumo por
 * execução. O registo do alerta (inserir só se não existir) garante que, com
 * várias instâncias, só uma avisa. Uma falha a avisar nunca para o resto.
 */
export class SendRollRemindersUseCase {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly classes: ClassRepository,
    private readonly pending: PendingRolls,
    private readonly reminders: RollReminderRepository,
    private readonly people: PeopleDirectory,
    private readonly notifier: Notifier,
    private readonly mailer: Mailer,
    private readonly messenger: CoordinationMessenger,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<RollRemindersResult> {
    const result: RollRemindersResult = { alerted: [], failures: [] };
    const calendar = await this.calendars.get();
    if (!calendar) return result;
    const now = this.clock.now();
    const classes = await this.classes.listByYear(calendar.label);
    const due = (await this.pending.list(calendar, classes, now)).filter(
      (item) => !item.alertedAt && isWithinReminderWindow(item.date, now),
    );
    for (const item of due) {
      const claimed = await this.reminders.claim({
        classId: item.classId,
        date: item.date,
        alertedAt: now,
      });
      if (claimed) result.alerted.push({ ...item, alertedAt: now.toISOString() });
    }
    if (!result.alerted.length) return result;

    const safely = async (what: string, action: () => Promise<unknown> | unknown) => {
      try {
        await action();
      } catch (error) {
        result.failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const catechists = new Map(
      (
        await this.people.findMany(
          result.alerted.flatMap((item) => item.catechists.map((person) => person.accountId)),
        )
      ).map((person) => [person.id, person]),
    );
    for (const item of result.alerted) {
      const dayLabel = sessionDayLabel(item.date);
      const text = rollReminderText(item.classLabel, item.date);
      const link = `/portal/presencas?turma=${item.classId}&data=${item.date}`;
      for (const { accountId } of item.catechists) {
        const person = catechists.get(accountId);
        if (!person?.active) continue;
        await safely(`notificação a ${accountId}`, () =>
          this.notifier.notify({
            to: { accountIds: [accountId] },
            kind: "catechesis.roll_reminder",
            title: `Chamada por lançar: ${dayLabel}`,
            body: text,
            link,
            // O email é o próprio, mais completo.
            email: false,
          }),
        );
        if (person.email) {
          const email = person.email;
          await safely(`email a ${accountId}`, () =>
            this.mailer.sendRollReminder({
              email,
              firstName: firstName(person.fullName),
              classLabel: item.classLabel,
              dayLabel,
              link,
            }),
          );
        }
        await safely(`mensagem a ${accountId}`, () =>
          this.messenger.post({ toAccountId: accountId, body: text, centerId: item.centerId }),
        );
      }
    }
    await this.digest(result, safely);
    return result;
  }

  /** Um resumo por execução para a coordenação (e administração). */
  private async digest(
    result: RollRemindersResult,
    safely: (what: string, action: () => Promise<unknown> | unknown) => Promise<void>,
  ) {
    const items = result.alerted.map((item) => ({
      classLabel: item.classLabel,
      dayLabel: sessionDayLabel(item.date),
      catechists: item.catechists.map((person) => person.name),
    }));
    const latest = result.alerted.reduce((max, item) => (item.date > max ? item.date : max), "");
    const link = `/dashboard/presencas?data=${latest}`;
    const title =
      items.length === 1 ? "1 chamada por lançar" : `${items.length} chamadas por lançar`;
    await safely("notificação à coordenação", () =>
      this.notifier.notify({
        to: { permission: "COORDINATION" },
        kind: "catechesis.pending_rolls",
        title,
        body: items
          .map(
            (item) =>
              `${item.dayLabel} · ${item.classLabel}${item.catechists.length ? ` (${item.catechists.join(", ")})` : ""}`,
          )
          .join("\n"),
        link,
        email: false,
      }),
    );
    await safely("email à coordenação", async () => {
      const staff = await this.people.findMany(await this.people.idsWithPermission("COORDINATION"));
      for (const person of staff) {
        if (!person.email || !person.active) continue;
        this.mailer.sendPendingRollsDigest({
          email: person.email,
          firstName: firstName(person.fullName),
          items,
          link,
        });
      }
    });
  }
}
