import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import {
  centerRef,
  rememberCenterName,
  SANTA_TERESINHA_CENTER_ID,
  SANTO_EXPEDITO_CENTER_ID,
  SEDE_CENTER_ID,
  SEEDED_CENTERS,
} from "../../../shared/domain/parish-centers.js";
import { InvalidCenterError } from "./errors/catechesis.errors.js";

export { centerRef, rememberCenterName };

export {
  SANTA_TERESINHA_CENTER_ID,
  SANTO_EXPEDITO_CENTER_ID,
  SEDE_CENTER_ID,
  SEEDED_CENTERS,
};

export const CenterStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export type CenterStatus = (typeof CenterStatus)[keyof typeof CenterStatus];

export interface CenterProps {
  name: string;
  location: string;
  status: CenterStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CenterView {
  id: string;
  name: string;
  location: string;
  status: CenterStatus;
  createdAt: string;
  updatedAt: string;
}

/** Centro de catequese da paróquia. Não se apaga: inativa-se. */
export class Center extends AggregateRoot<CenterProps> {
  static create(input: { name: string; location: string; now: Date }): Center {
    const name = cleanName(input.name);
    const location = cleanLocation(input.location);
    return new Center({
      name,
      location,
      status: CenterStatus.ACTIVE,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(props: CenterProps, id: UniqueId): Center {
    return new Center({ ...props }, id);
  }

  /** Os três centros que a paróquia já tem (testes e arranque em memória). */
  static seeded(now: Date): Center[] {
    return SEEDED_CENTERS.map((item) =>
      Center.restore(
        {
          name: item.name,
          location: item.location,
          status: CenterStatus.ACTIVE,
          createdAt: now,
          updatedAt: now,
        },
        UniqueId.from(item.id),
      ),
    );
  }

  get name() {
    return this.props.name;
  }
  get location() {
    return this.props.location;
  }
  get status() {
    return this.props.status;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  get isActive() {
    return this.props.status === CenterStatus.ACTIVE;
  }

  rename(name: string, now: Date) {
    this.props.name = cleanName(name);
    this.props.updatedAt = now;
  }

  relocate(location: string, now: Date) {
    this.props.location = cleanLocation(location);
    this.props.updatedAt = now;
  }

  setStatus(status: CenterStatus, now: Date) {
    this.props.status = status;
    this.props.updatedAt = now;
  }

  toView(): CenterView {
    return {
      id: this.id.value,
      name: this.name,
      location: this.location,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new InvalidCenterError("O nome do centro tem entre 2 e 80 caracteres.");
  }
  return name;
}

function cleanLocation(value: string) {
  const location = value.trim().replace(/\s+/g, " ");
  if (location.length < 2 || location.length > 160) {
    throw new InvalidCenterError("A localização do centro tem entre 2 e 160 caracteres.");
  }
  return location;
}
