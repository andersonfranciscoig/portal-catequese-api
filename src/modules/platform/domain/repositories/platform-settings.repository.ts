import type { PlatformSettings } from "../platform-settings.js";

export abstract class PlatformSettingsRepository {
  /** A configuração atual (ou a de origem, se ainda não foi guardada). */
  abstract get(): Promise<PlatformSettings>;
  abstract save(settings: PlatformSettings): Promise<void>;
}
