import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { UseCase } from "../../../../shared/application/use-case.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { AccessRequest, type AccessProfile } from "../../domain/access-request.js";
import { DuplicateAccessRequestError } from "../../domain/errors/platform.errors.js";
import type { AccessRequestRepository } from "../../domain/repositories/access-request.repository.js";
import { ContactEmail, ContactPhone } from "../../domain/value-objects/contact.js";
import { toAccessRequestView, type AccessRequestView } from "../views.js";

export interface SubmitAccessRequestInput {
  fullName: string;
  phone: string;
  email?: string;
  profile: AccessProfile;
  message?: string;
}

/** Pedido público para participar na fase de testes (sem conta). */
export class SubmitAccessRequestUseCase implements UseCase<
  SubmitAccessRequestInput,
  AccessRequestView
> {
  constructor(
    private readonly requests: AccessRequestRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: SubmitAccessRequestInput): Promise<AccessRequestView> {
    const phone = ContactPhone.create(input.phone);
    const email = input.email ? ContactEmail.create(input.email) : undefined;
    const existing = await this.requests.findOpenByContact(phone, email);
    if (existing) throw new DuplicateAccessRequestError(existing.status === "APPROVED");

    const request = AccessRequest.submit({ ...input, phone, email, now: this.clock.now() });
    await this.requests.save(request);
    await this.activity.record({
      category: "ADMIN",
      action: "platform.access_requested",
      summary: `${request.fullName} pediu acesso à fase de testes`,
    });
    return toAccessRequestView(request);
  }
}
