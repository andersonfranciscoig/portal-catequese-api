import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { ClassCatechistRole, type CatechesisLevel, type SessionSlot } from "./catechesis.js";
import { InvalidClassError } from "./errors/catechesis.errors.js";

export interface ClassCatechist {
  accountId: string;
  role: ClassCatechistRole;
}

export interface CatechesisClassProps {
  catecheticalYear: string;
  level: CatechesisLevel;
  /** "A", "B"… */
  section: string;
  slot: SessionSlot;
  /** "08:00" — ausente no domingo (começa no fim da missa). */
  startTime?: string;
  room: string;
  capacity: number;
  catechists: ClassCatechist[];
  createdAt: Date;
}

export type CreateClassProps = Omit<CatechesisClassProps, "catechists" | "createdAt"> & {
  now: Date;
};

const SECTION = /^[A-Z]$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Turma de um nível num ano catequético, com os seus catequistas. */
export class CatechesisClass extends AggregateRoot<CatechesisClassProps> {
  static create({ now, ...props }: CreateClassProps): CatechesisClass {
    const section = props.section.trim().toUpperCase();
    const room = props.room.trim();
    if (!SECTION.test(section))
      throw new InvalidClassError("A turma é identificada por uma letra (A, B…).");
    if (!room || room.length > 60) throw new InvalidClassError("Indique a sala.");
    if (props.startTime && !TIME.test(props.startTime)) {
      throw new InvalidClassError("A hora escreve-se assim: 08:00.");
    }
    if (!Number.isInteger(props.capacity) || props.capacity < 1 || props.capacity > 100) {
      throw new InvalidClassError("A lotação tem de ser entre 1 e 100.");
    }
    return new CatechesisClass({ ...props, section, room, catechists: [], createdAt: now });
  }

  static restore(props: CatechesisClassProps, id: UniqueId): CatechesisClass {
    return new CatechesisClass({ ...props, catechists: [...props.catechists] }, id);
  }

  get catecheticalYear() {
    return this.props.catecheticalYear;
  }
  get level() {
    return this.props.level;
  }
  get section() {
    return this.props.section;
  }
  get slot() {
    return this.props.slot;
  }
  get startTime() {
    return this.props.startTime;
  }
  get room() {
    return this.props.room;
  }
  get capacity() {
    return this.props.capacity;
  }
  get catechists(): readonly ClassCatechist[] {
    return this.props.catechists;
  }
  get createdAt() {
    return this.props.createdAt;
  }

  get lead(): ClassCatechist | undefined {
    return this.props.catechists.find((item) => item.role === ClassCatechistRole.LEAD);
  }

  hasCatechist(accountId: string): boolean {
    return this.props.catechists.some((item) => item.accountId === accountId);
  }

  /** Substitui os catequistas: um principal no máximo, sem repetidos. */
  assignCatechists(catechists: ClassCatechist[]) {
    const ids = new Set(catechists.map((item) => item.accountId));
    if (ids.size !== catechists.length) {
      throw new InvalidClassError("O mesmo catequista aparece mais do que uma vez.");
    }
    if (catechists.filter((item) => item.role === ClassCatechistRole.LEAD).length > 1) {
      throw new InvalidClassError("A turma só pode ter um catequista principal.");
    }
    this.props.catechists = catechists.map((item) => ({ ...item }));
  }
}
