import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import { ClassCatechistRole, type CatechesisLevel, type SessionSlot } from "./catechesis.js";
import { SEDE_CENTER_ID } from "./center.js";
import { InvalidClassError } from "./errors/catechesis.errors.js";
import { CANDIDATE_LEVEL, type SacramentType } from "./sacraments.js";

export const ClassKind = { REGULAR: "REGULAR", SPECIAL: "SPECIAL" } as const;
export type ClassKind = (typeof ClassKind)[keyof typeof ClassKind];

export const ClassAudience = { CHILD: "CHILD", ADULT: "ADULT" } as const;
export type ClassAudience = (typeof ClassAudience)[keyof typeof ClassAudience];

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
  centerId: string;
  kind: ClassKind;
  /** Turma especial: sacramento e se é de crianças ou de adultos. */
  sacrament?: SacramentType;
  audience?: ClassAudience;
  catechists: ClassCatechist[];
  createdAt: Date;
}

export type CreateClassProps = Omit<
  CatechesisClassProps,
  "catechists" | "createdAt" | "centerId" | "kind" | "sacrament" | "audience"
> & {
  now: Date;
  centerId?: string;
};

const SECTION = /^[A-Z]$/;
const SPECIAL_NAME = /^[\p{L}0-9][\p{L}0-9 .'-]{1,39}$/u;
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
    return new CatechesisClass({
      ...props,
      section,
      room,
      centerId: props.centerId ?? SEDE_CENTER_ID,
      kind: "REGULAR",
      catechists: [],
      createdAt: now,
    });
  }

  /** Turma fora do percurso (adultos, batismo de bebés): o cadastro é manual. */
  static createSpecial(input: {
    sacrament: SacramentType;
    audience: ClassAudience;
    section: string;
    slot: SessionSlot;
    startTime?: string;
    room: string;
    capacity: number;
    centerId?: string;
    catecheticalYear: string;
    now: Date;
  }): CatechesisClass {
    const section = input.section.trim().replace(/\s+/g, " ");
    const room = input.room.trim();
    if (!SPECIAL_NAME.test(section)) {
      throw new InvalidClassError("O nome da turma especial tem entre 2 e 40 caracteres.");
    }
    if (!room || room.length > 60) throw new InvalidClassError("Indique a sala.");
    if (input.startTime && !TIME.test(input.startTime)) {
      throw new InvalidClassError("A hora escreve-se assim: 08:00.");
    }
    if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100) {
      throw new InvalidClassError("A lotação tem de ser entre 1 e 100.");
    }
    return new CatechesisClass({
      catecheticalYear: input.catecheticalYear,
      level: CANDIDATE_LEVEL[input.sacrament],
      section,
      slot: input.slot,
      startTime: input.startTime,
      room,
      capacity: input.capacity,
      centerId: input.centerId ?? SEDE_CENTER_ID,
      kind: "SPECIAL",
      sacrament: input.sacrament,
      audience: input.audience,
      catechists: [],
      createdAt: input.now,
    });
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
  get centerId() {
    return this.props.centerId;
  }
  get kind() {
    return this.props.kind;
  }
  get isSpecial() {
    return this.props.kind === "SPECIAL";
  }
  get sacrament() {
    return this.props.sacrament;
  }
  get audience() {
    return this.props.audience;
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
