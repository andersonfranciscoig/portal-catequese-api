import type { AccessRequestRepository } from "../../domain/repositories/access-request.repository.js";
import type { PlatformSettingsRepository } from "../../domain/repositories/platform-settings.repository.js";
import {
  toPlatformStatus,
  toPublicStatus,
  type PlatformStatusView,
  type PublicStatusView,
} from "../views.js";

/** Estado público (sem autenticação): fase de lançamento e portal aberto ou não. */
export class GetPublicStatusUseCase {
  constructor(private readonly settings: PlatformSettingsRepository) {}

  async execute(): Promise<PublicStatusView> {
    return toPublicStatus(await this.settings.get());
  }
}

/** Estado completo para a administração. */
export class GetPlatformStatusUseCase {
  constructor(
    private readonly settings: PlatformSettingsRepository,
    private readonly requests: AccessRequestRepository,
  ) {}

  async execute(): Promise<PlatformStatusView> {
    const [settings, pending] = await Promise.all([
      this.settings.get(),
      this.requests.countPending(),
    ]);
    return toPlatformStatus(settings, pending);
  }
}
