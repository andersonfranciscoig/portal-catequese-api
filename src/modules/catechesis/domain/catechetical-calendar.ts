import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import { SLOT_WEEKDAY, type SessionSlot } from "./catechesis.js";
import { addDays, isIsoDate, weekday } from "./dates.js";
import { InvalidCalendarError } from "./errors/catechesis.errors.js";

export interface CatecheticalCalendarProps {
  /** "2026/2027" */
  label: string;
  /** Primeiro dia da catequese (YYYY-MM-DD). */
  startsOn: string;
  /** Último dia da catequese (YYYY-MM-DD). */
  endsOn: string;
  updatedAt: Date;
  updatedBy?: string;
}

const LABEL = /^(\d{4})\/(\d{4})$/;

/** O ano catequético em curso e o calendário dos encontros (semanais, por período). */
export class CatecheticalCalendar extends AggregateRoot<CatecheticalCalendarProps> {
  static readonly ID = UniqueId.from("catechesis");

  static define(props: Omit<CatecheticalCalendarProps, "updatedAt">, now: Date) {
    validate(props);
    return new CatecheticalCalendar({ ...props, updatedAt: now }, CatecheticalCalendar.ID);
  }

  static restore(props: CatecheticalCalendarProps) {
    return new CatecheticalCalendar({ ...props }, CatecheticalCalendar.ID);
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
