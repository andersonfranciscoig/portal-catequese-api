import { AggregateRoot } from "../../../shared/domain/aggregate-root.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";

export const LaunchMode = {
  /** Fase de testes: só testadores aceites (e a administração). */
  BETA: "BETA",
  /** Aberto a todos. */
  PUBLIC: "PUBLIC",
} as const;

export type LaunchMode = (typeof LaunchMode)[keyof typeof LaunchMode];

export const DEFAULT_CLOSED_MESSAGE =
  "O portal está temporariamente encerrado. Voltamos em breve — obrigado pela compreensão.";

export interface PlatformSettingsProps {
  launchMode: LaunchMode;
  launchChangedAt?: Date;
  launchChangedBy?: string;
  portalOpen: boolean;
  closedMessage?: string;
  /** Previsão de reabertura (YYYY-MM-DD). */
  reopensAt?: string;
  portalChangedAt?: Date;
  portalChangedBy?: string;
}

/** Configuração única da plataforma: fase de lançamento e estado do portal. */
export class PlatformSettings extends AggregateRoot<PlatformSettingsProps> {
  static readonly ID = UniqueId.from("platform");

  /** Valores de origem: fase de testes, portal aberto. */
  static initial(): PlatformSettings {
    return new PlatformSettings({ launchMode: LaunchMode.BETA, portalOpen: true }, this.ID);
  }

  static restore(props: PlatformSettingsProps): PlatformSettings {
    return new PlatformSettings({ ...props }, this.ID);
  }

  get launchMode() {
    return this.props.launchMode;
  }
  get launchChangedAt() {
    return this.props.launchChangedAt;
  }
  get launchChangedBy() {
    return this.props.launchChangedBy;
  }
  get portalOpen() {
    return this.props.portalOpen;
  }
  get closedMessage() {
    return this.props.closedMessage;
  }
  get reopensAt() {
    return this.props.reopensAt;
  }
  get portalChangedAt() {
    return this.props.portalChangedAt;
  }
  get portalChangedBy() {
    return this.props.portalChangedBy;
  }

  setLaunchMode(mode: LaunchMode, by: string, now: Date): void {
    this.props.launchMode = mode;
    this.props.launchChangedAt = now;
    this.props.launchChangedBy = by;
  }

  closePortal(
    { message, reopensAt }: { message?: string; reopensAt?: string },
    by: string,
    now: Date,
  ) {
    this.props.portalOpen = false;
    this.props.closedMessage = message?.trim() || DEFAULT_CLOSED_MESSAGE;
    this.props.reopensAt = reopensAt;
    this.props.portalChangedAt = now;
    this.props.portalChangedBy = by;
  }

  reopenPortal(by: string, now: Date): void {
    this.props.portalOpen = true;
    this.props.closedMessage = undefined;
    this.props.reopensAt = undefined;
    this.props.portalChangedAt = now;
    this.props.portalChangedBy = by;
  }
}
