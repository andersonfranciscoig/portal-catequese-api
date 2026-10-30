import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";
import type { Gender, GuardianRelationship } from "./catechesis.js";
import { isIsoDate } from "./dates.js";
import { SEDE_CENTER_ID } from "./center.js";
import { InvalidCatechumenError } from "./errors/catechesis.errors.js";

export interface CatechumenProps {
  fullName: string;
  /** YYYY-MM-DD */
  birthDate: string;
  gender: Gender;
  address?: string;
  baptized: boolean;
  firstCommunion: boolean;
  /** Conta do encarregado (menores). */
  guardianAccountId?: string;
  guardianRelationship?: GuardianRelationship;
  /** Conta própria (adulto inscrito por si). */
  accountId?: string;
  centerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RegisterCatechumenProps = Omit<
  CatechumenProps,
  "createdAt" | "updatedAt" | "centerId"
> & {
  now: Date;
  centerId?: string;
};

/** Quem faz a catequese. Pertence a um encarregado (menor) ou à própria conta (adulto). */
export class Catechumen extends AggregateRoot<CatechumenProps> {
  static register({ now, ...props }: RegisterCatechumenProps): Catechumen {
    const fullName = props.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length > 120 || fullName.split(" ").length < 2) {
      throw new InvalidCatechumenError("Escreva o nome e o apelido do catequizando.");
    }
    if (!isIsoDate(props.birthDate)) {
      throw new InvalidCatechumenError("A data de nascimento não é válida.");
    }
    if (props.firstCommunion && !props.baptized) {
      throw new InvalidCatechumenError("A Primeira Comunhão exige o Batismo.");
    }
    if (!props.guardianAccountId === !props.accountId) {
      throw new InvalidCatechumenError(
        "O catequizando tem um encarregado ou é ele próprio a conta.",
      );
    }
    return new Catechumen({
      ...props,
      fullName,
      address: props.address?.trim() || undefined,
      centerId: props.centerId ?? SEDE_CENTER_ID,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: CatechumenProps, id: UniqueId): Catechumen {
    return new Catechumen({ ...props }, id);
  }

  get fullName() {
    return this.props.fullName;
  }
  get birthDate() {
    return this.props.birthDate;
  }
  get gender() {
    return this.props.gender;
  }
  get address() {
    return this.props.address;
  }
  get baptized() {
    return this.props.baptized;
  }
  get firstCommunion() {
    return this.props.firstCommunion;
  }
  get guardianAccountId() {
    return this.props.guardianAccountId;
  }
  get guardianRelationship() {
    return this.props.guardianRelationship;
  }
  get accountId() {
    return this.props.accountId;
  }
  get centerId() {
    return this.props.centerId;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  /** O encarregado ou o próprio adulto. */
  isAccessibleBy(accountId: string): boolean {
    return this.props.guardianAccountId === accountId || this.props.accountId === accountId;
  }

  /**
   * Acompanha o registo de um sacramento (Batismo e Primeira Comunhão têm
   * também o "sim/não" usado nos requisitos e na matrícula). A ordem e as
   * datas são validadas com os registos, antes de chegar aqui.
   */
  setSacrament(type: "BAPTISM" | "FIRST_COMMUNION" | "CONFIRMATION", received: boolean, now: Date) {
    if (type === "BAPTISM") this.props.baptized = received;
    else if (type === "FIRST_COMMUNION") this.props.firstCommunion = received;
    else return;
    this.props.updatedAt = now;
  }

  /** O centro da matrícula mais recente. */
  placeAt(centerId: string, now: Date) {
    this.props.centerId = centerId;
    this.props.updatedAt = now;
  }

  /** Dados atualizados numa nova matrícula (morada e sacramentos). */
  update(
    {
      address,
      baptized,
      firstCommunion,
    }: Pick<CatechumenProps, "address" | "baptized" | "firstCommunion">,
    now: Date,
  ) {
    if (firstCommunion && !baptized) {
      throw new InvalidCatechumenError("A Primeira Comunhão exige o Batismo.");
    }
    this.props.address = address?.trim() || this.props.address;
    // Um sacramento recebido não se perde.
    this.props.baptized ||= baptized;
    this.props.firstCommunion ||= firstCommunion;
    this.props.updatedAt = now;
  }
}
