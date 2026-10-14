import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../shared/application/notifier.js";
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

const PROFILE_LABEL: Record<AccessProfile, string> = {
  GUARDIAN: "encarregado de educação",
  CATECHUMEN: "catecúmeno adulto",
  CATECHIST: "catequista",
  COORDINATION: "coordenação",
};

/** Pedido público para participar na fase de testes (sem conta). */
export class SubmitAccessRequestUseCase implements UseCase<
  SubmitAccessRequestInput,
  AccessRequestView
> {
  constructor(
    private readonly requests: AccessRequestRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
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
    await this.notifier.notify({
      to: { permission: "SUPER_ADMIN" },
      kind: "platform.access_requested",
      title: "Novo pedido de acesso à fase de testes",
      body: `${request.fullName} (${PROFILE_LABEL[request.profile]}) pediu acesso.`,
      link: "/admin/pedidos",
    });
    return toAccessRequestView(request);
  }
}
