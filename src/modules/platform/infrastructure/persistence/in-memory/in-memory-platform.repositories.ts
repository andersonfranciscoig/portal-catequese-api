import type { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { AccessRequest, AccessRequestStatus } from "../../../domain/access-request.js";
import { PlatformSettings } from "../../../domain/platform-settings.js";
import { AccessRequestRepository } from "../../../domain/repositories/access-request.repository.js";
import { PlatformSettingsRepository } from "../../../domain/repositories/platform-settings.repository.js";
import type { ContactEmail, ContactPhone } from "../../../domain/value-objects/contact.js";

export class InMemoryPlatformSettingsRepository extends PlatformSettingsRepository {
  current = PlatformSettings.initial();

  async get() {
    return this.current;
  }

  async save(settings: PlatformSettings) {
    this.current = settings;
  }
}

export class InMemoryAccessRequestRepository extends AccessRequestRepository {
  readonly items = new Map<string, AccessRequest>();

  async findById(id: UniqueId) {
    return this.items.get(id.value) ?? null;
  }

  async findOpenByContact(phone: ContactPhone, email?: ContactEmail) {
    const open = [...this.items.values()].filter(
      (item) =>
        item.status !== "REJECTED" &&
        (item.phone.equals(phone) || Boolean(email && item.email?.equals(email))),
    );
    // Um pedido aceite tem prioridade sobre um por decidir.
    return open.find((item) => item.status === "APPROVED") ?? open[0] ?? null;
  }

  async list(status?: AccessRequestStatus) {
    return [...this.items.values()]
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async countPending() {
    return [...this.items.values()].filter((item) => item.status === "PENDING").length;
  }

  async save(request: AccessRequest) {
    this.items.set(request.id.value, request);
  }
}
