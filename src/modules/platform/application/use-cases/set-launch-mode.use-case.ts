import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { LaunchMode } from "../../domain/platform-settings.js";
import type { AccessRequestRepository } from "../../domain/repositories/access-request.repository.js";
import type { PlatformSettingsRepository } from "../../domain/repositories/platform-settings.repository.js";
import { toPlatformStatus, type PlatformStatusView } from "../views.js";

export interface SetLaunchModeInput {
  actorId: string;
  mode: LaunchMode;
}

/** Abre o portal a todos (fim da fase de testes) ou volta à fase de testes. */
export class SetLaunchModeUseCase implements UseCase<SetLaunchModeInput, PlatformStatusView> {
  constructor(
    private readonly settings: PlatformSettingsRepository,
    private readonly requests: AccessRequestRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, mode }: SetLaunchModeInput) {
    const settings = await this.settings.get();
    if (settings.launchMode !== mode) {
      settings.setLaunchMode(mode, actorId, this.clock.now());
      await this.settings.save(settings);
      await this.activity.record({
        actorId,
        category: "ADMIN",
        action: mode === LaunchMode.PUBLIC ? "platform.launch_public" : "platform.launch_beta",
        summary:
          mode === LaunchMode.PUBLIC
            ? "Abriu o portal a todos (fim da fase de testes)"
            : "Voltou a pôr o portal em fase de testes",
      });
    }
    return toPlatformStatus(settings, await this.requests.countPending());
  }
}
