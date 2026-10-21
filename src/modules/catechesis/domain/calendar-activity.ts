import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { InvalidCalendarActivityError } from "./errors/catechesis.errors.js";

export const CalendarActivityKind = {
  ENROLLMENT: "ENROLLMENT",
  MEETING: "MEETING",
  CATECHESIS: "CATECHESIS",
  CELEBRATION: "CELEBRATION",
} as const;
export type CalendarActivityKind = (typeof CalendarActivityKind)[keyof typeof CalendarActivityKind];

export const CalendarActivityAudience = {
  ALL: "ALL",
  GUARDIANS: "GUARDIANS",
  CATECHISTS: "CATECHISTS",
} as const;
export type CalendarActivityAudience =
  (typeof CalendarActivityAudience)[keyof typeof CalendarActivityAudience];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarActivityProps {
  title: string;
  description: string;
  kind: CalendarActivityKind;
  audience: CalendarActivityAudience;
  startsOn: string;
  endsOn?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export class CalendarActivity extends AggregateRoot<CalendarActivityProps> {
  static create(
    input: Omit<CalendarActivityProps, "createdAt" | "updatedAt"> & { now: Date },
  ): CalendarActivity {
    const props = checked({ ...input, createdAt: input.now, updatedAt: input.now });
    return new CalendarActivity(props);
  }

  static restore(props: CalendarActivityProps, id: UniqueId): CalendarActivity {
    return new CalendarActivity(props, id);
  }

  get title() {
    return this.props.title;
  }
  get description() {
    return this.props.description;
  }
  get kind() {
    return this.props.kind;
  }
  get audience() {
    return this.props.audience;
  }
  get startsOn() {
    return this.props.startsOn;
  }
  get endsOn() {
    return this.props.endsOn;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get createdBy() {
    return this.props.createdBy;
  }

  change(input: Omit<CalendarActivityProps, "createdAt" | "updatedAt" | "createdBy">, now: Date) {
    const next = checked({
      ...input,
      createdAt: this.props.createdAt,
      updatedAt: now,
      createdBy: this.props.createdBy,
    });
    this.props = next;
  }
}

function checked(props: CalendarActivityProps): CalendarActivityProps {
  const title = props.title.trim();
  const description = props.description.trim();
  if (title.length < 3 || title.length > 80) {
    throw new InvalidCalendarActivityError("Escreva um título (pelo menos 3 letras).");
  }
  if (description.length < 3 || description.length > 400) {
    throw new InvalidCalendarActivityError("Escreva uma descrição curta.");
  }
  if (!DATE.test(props.startsOn) || (props.endsOn && !DATE.test(props.endsOn))) {
    throw new InvalidCalendarActivityError("Use datas no formato AAAA-MM-DD.");
  }
  if (props.endsOn && props.endsOn < props.startsOn) {
    throw new InvalidCalendarActivityError("A data de fim não pode ser anterior ao início.");
  }
  return { ...props, title, description, endsOn: props.endsOn || undefined };
}
