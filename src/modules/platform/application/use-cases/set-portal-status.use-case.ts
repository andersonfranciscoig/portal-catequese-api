import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import type { AccessRequestRepository } from "../../domain/repositories/access-request.repository.js";
import type { PlatformSettingsRepository } from "../../domain/repositories/platform-settings.repository.js";
import { toPlatformStatus, type PlatformStatusView } from "../views.js";

export interface SetPortalStatusInput {
  actorId: string;
  open: boolean;
  /** Aviso a mostrar com o portal encerrado. */
  message?: string;
  /** Previsão de reabertura (YYYY-MM-DD). */
  reopensAt?: string;
}

/** Encerra o portal (manutenção, problema grave…) ou volta a abri-lo. */
export class SetPortalStatusUseCase implements UseCase<SetPortalStatusInput, PlatformStatusView> {
  constructor(
    private readonly settings: PlatformSettingsRepository,
    private readonly requests: AccessRequestRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, open, message, reopensAt }: SetPortalStatusInput) {
    const settings = await this.settings.get();
    const now = this.clock.now();
    if (open) settings.reopenPortal(actorId, now);
    else settings.closePortal({ message, reopensAt }, actorId, now);
    await this.settings.save(settings);
    await this.activity.record({
      actorId,
      category: "ADMIN",
      action: open ? "platform.portal_opened" : "platform.portal_closed",
      summary: open ? "Reabriu o portal" : `Encerrou o portal: ${settings.closedMessage}`,
    });
    return toPlatformStatus(settings, await this.requests.countPending());
  }
}
