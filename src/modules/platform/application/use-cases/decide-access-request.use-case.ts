import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { EventBus } from "../../../../shared/application/event-bus.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { AccessRequestNotFoundError } from "../../domain/errors/platform.errors.js";
import type { AccessRequestRepository } from "../../domain/repositories/access-request.repository.js";
import { toAccessRequestView, type AccessRequestView } from "../views.js";

export interface DecideAccessRequestInput {
  actorId: string;
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  note?: string;
}

/**
 * Aceita ou recusa um pedido. Ao aceitar, publica o evento: o módulo de
 * identidade dá acesso às contas que já existam com esse contacto.
 */
export class DecideAccessRequestUseCase implements UseCase<
  DecideAccessRequestInput,
  AccessRequestView
> {
  constructor(
    private readonly requests: AccessRequestRepository,
    private readonly events: EventBus,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ actorId, requestId, decision, note }: DecideAccessRequestInput) {
    const request = await this.requests.findById(UniqueId.from(requestId));
    if (!request) throw new AccessRequestNotFoundError();

    const now = this.clock.now();
    if (decision === "APPROVED") request.approve(actorId, now);
    else request.reject(actorId, note, now);
    await this.requests.save(request);
    await this.events.publish(request.pullEvents());
    await this.activity.record({
      actorId,
      category: "ADMIN",
      action: decision === "APPROVED" ? "platform.access_approved" : "platform.access_rejected",
      summary:
        decision === "APPROVED"
          ? `Aceitou o pedido de acesso de ${request.fullName}`
          : `Recusou o pedido de acesso de ${request.fullName}${request.decisionNote ? `: ${request.decisionNote}` : ""}`,
    });
    return toAccessRequestView(request);
  }
}
