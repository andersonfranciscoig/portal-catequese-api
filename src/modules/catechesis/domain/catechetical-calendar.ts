import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import { SLOT_WEEKDAY, type SessionSlot } from "./catechesis.js";
import { addDays, isIsoDate, weekday } from "./dates.js";
import { DeadlineClosedError, InvalidCalendarError } from "./errors/catechesis.errors.js";

/** Prazo das famílias: matrícula nova ou confirmação do ano seguinte. */
export type DeadlinePurpose = "ENROLLMENT" | "CONFIRMATION";

export interface DateWindow {
  /** YYYY-MM-DD */
  startsOn: string;
  /** YYYY-MM-DD (inclusive) */
  endsOn: string;
}

/** Antes de abrir, aberto ou já terminado (sem prazo definido: sempre aberto). */
export type WindowState = "before" | "open" | "after";

export interface CatecheticalCalendarProps {
  /** "2026/2027" */
  label: string;
  /** Primeiro dia da catequese (YYYY-MM-DD). */
  startsOn: string;
  /** Último dia da catequese (YYYY-MM-DD). */
  endsOn: string;
  /** Prazos das famílias (sem prazo: sempre aberto). */
  windows: Partial<Record<DeadlinePurpose, DateWindow>>;
  updatedAt: Date;
  updatedBy?: string;
}

const LABEL = /^(\d{4})\/(\d{4})$/;

/** O ano catequético em curso e o calendário dos encontros (semanais, por período). */
export class CatecheticalCalendar extends AggregateRoot<CatecheticalCalendarProps> {
  static readonly ID = UniqueId.from("catechesis");

  static define(
    props: Omit<CatecheticalCalendarProps, "updatedAt" | "windows"> & {
      windows?: CatecheticalCalendarProps["windows"];
    },
    now: Date,
  ) {
    validate(props);
    return new CatecheticalCalendar(
      { ...props, windows: { ...props.windows }, updatedAt: now },
      CatecheticalCalendar.ID,
    );
  }

  static restore(props: CatecheticalCalendarProps) {
    return new CatecheticalCalendar(
      { ...props, windows: { ...props.windows } },
      CatecheticalCalendar.ID,
    );
  }

  get windows(): Readonly<Partial<Record<DeadlinePurpose, DateWindow>>> {
    return this.props.windows;
  }

  /** Define (ou retira, com `null`) o prazo das famílias. */
  setWindow(purpose: DeadlinePurpose, window: DateWindow | null, actorId: string, now: Date) {
    if (window) {
      if (
        !isIsoDate(window.startsOn) ||
        !isIsoDate(window.endsOn) ||
        window.startsOn > window.endsOn
      ) {
        throw new InvalidCalendarError("O fim do prazo tem de ser depois do início.");
      }
      this.props.windows[purpose] = { startsOn: window.startsOn, endsOn: window.endsOn };
    } else {
      delete this.props.windows[purpose];
    }
    Object.assign(this.props, { updatedAt: now, updatedBy: actorId });
  }

  /** Fora do prazo, as famílias não podem (a coordenação com "fora do prazo" pode). */
  assertOpen(purpose: DeadlinePurpose, today: string) {
    const state = this.windowState(purpose, today);
    if (state === "open") return;
    const window = this.props.windows[purpose]!;
    const what = purpose === "ENROLLMENT" ? "As matrículas" : "As confirmações";
    const date = (value: string) => value.split("-").reverse().join("/");
    throw new DeadlineClosedError(
      state === "before"
        ? `${what} abrem a ${date(window.startsOn)}.`
        : `${what} terminaram a ${date(window.endsOn)}. Fale com a secretaria da catequese.`,
    );
  }

  windowState(purpose: DeadlinePurpose, today: string): WindowState {
    const window = this.props.windows[purpose];
    if (!window) return "open";
    if (today < window.startsOn) return "before";
    return today > window.endsOn ? "after" : "open";
  }

  get label() {
    return this.props.label;
  }
  get startsOn() {
    return this.props.startsOn;
  }
  get endsOn() {
    return this.props.endsOn;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get updatedBy() {
    return this.props.updatedBy;
  }

  change(
    { label, startsOn, endsOn }: Pick<CatecheticalCalendarProps, "label" | "startsOn" | "endsOn">,
    actorId: string,
    now: Date,
  ) {
    validate({ label, startsOn, endsOn });
    Object.assign(this.props, { label, startsOn, endsOn, updatedAt: now, updatedBy: actorId });
  }

  /** Encontros do período, do início do ano até `until` (inclusive) e nunca depois do fim. */
  sessionDates(slot: SessionSlot, until: string = this.props.endsOn): string[] {
    const last = until < this.props.endsOn ? until : this.props.endsOn;
    const offset = (SLOT_WEEKDAY[slot] - weekday(this.props.startsOn) + 7) % 7;
    const dates: string[] = [];
    for (let date = addDays(this.props.startsOn, offset); date <= last; date = addDays(date, 7)) {
      dates.push(date);
    }
    return dates;
  }

  /** Próximo encontro a partir de `from` (inclusive), se o ano ainda não acabou. */
  nextSession(slot: SessionSlot, from: string): string | undefined {
    const start = from > this.props.startsOn ? from : this.props.startsOn;
    const offset = (SLOT_WEEKDAY[slot] - weekday(start) + 7) % 7;
    const next = addDays(start, offset);
    return next <= this.props.endsOn ? next : undefined;
  }

  isSessionDate(slot: SessionSlot, date: string): boolean {
    return (
      isIsoDate(date) &&
      date >= this.props.startsOn &&
      date <= this.props.endsOn &&
      weekday(date) === SLOT_WEEKDAY[slot]
    );
  }
}

function validate({
  label,
  startsOn,
  endsOn,
}: Pick<CatecheticalCalendarProps, "label" | "startsOn" | "endsOn">) {
  const match = LABEL.exec(label);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new InvalidCalendarError("O ano catequético escreve-se assim: 2026/2027.");
  }
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn) || startsOn >= endsOn) {
    throw new InvalidCalendarError("O fim da catequese tem de ser depois do início.");
  }
}
