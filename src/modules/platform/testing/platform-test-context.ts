import { RecordingNotifier } from "../../../shared/testing/recording-notifier.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import { RecordingActivity } from "../../../shared/testing/recording-activity.js";
import { RecordingEventBus } from "../../../shared/testing/recording-event-bus.js";
import { PlatformLaunchAccess } from "../application/platform-launch-access.js";
import { DecideAccessRequestUseCase } from "../application/use-cases/decide-access-request.use-case.js";
import {
  GetPlatformStatusUseCase,
  GetPublicStatusUseCase,
} from "../application/use-cases/get-platform-status.use-case.js";
import { ListAccessRequestsUseCase } from "../application/use-cases/list-access-requests.use-case.js";
import { SetLaunchModeUseCase } from "../application/use-cases/set-launch-mode.use-case.js";
import { SetPortalStatusUseCase } from "../application/use-cases/set-portal-status.use-case.js";
import { SubmitAccessRequestUseCase } from "../application/use-cases/submit-access-request.use-case.js";
import {
  InMemoryAccessRequestRepository,
  InMemoryPlatformSettingsRepository,
} from "../infrastructure/persistence/in-memory/in-memory-platform.repositories.js";

export function createPlatformTestContext() {
  const settings = new InMemoryPlatformSettingsRepository();
  const requests = new InMemoryAccessRequestRepository();
  const events = new RecordingEventBus();
  const activity = new RecordingActivity();
  const clock = new FixedClock();
  const notifier = new RecordingNotifier();
  return {
    settings,
    requests,
    events,
    activity,
    clock,
    notifier,
    launchAccess: new PlatformLaunchAccess(settings, requests),
    publicStatus: new GetPublicStatusUseCase(settings),
    status: new GetPlatformStatusUseCase(settings, requests),
    setLaunchMode: new SetLaunchModeUseCase(settings, requests, activity, clock),
    setPortalStatus: new SetPortalStatusUseCase(settings, requests, activity, clock),
    submit: new SubmitAccessRequestUseCase(requests, activity, clock, notifier),
    list: new ListAccessRequestsUseCase(requests),
    decide: new DecideAccessRequestUseCase(requests, events, activity, clock),
  };
}

export const ADMIN_ID = "6f9a2a1e-0000-4000-8000-000000000001";
