import {
  LaunchAccessPolicy,
  type LaunchSnapshot,
} from "../../../shared/application/launch-access-policy.js";
import type { AccessRequestRepository } from "../domain/repositories/access-request.repository.js";
import type { PlatformSettingsRepository } from "../domain/repositories/platform-settings.repository.js";
import { ContactEmail, ContactPhone } from "../domain/value-objects/contact.js";

/** Implementação, por este módulo, do contrato partilhado da fase de lançamento. */
export class PlatformLaunchAccess extends LaunchAccessPolicy {
  constructor(
    private readonly settings: PlatformSettingsRepository,
    private readonly requests: AccessRequestRepository,
  ) {
    super();
  }

  async snapshot(): Promise<LaunchSnapshot> {
    const settings = await this.settings.get();
    return {
      mode: settings.launchMode,
      portalOpen: settings.portalOpen,
      closedMessage: settings.closedMessage,
    };
  }

  async isApprovedForBeta(phone: string, email?: string): Promise<boolean> {
    const request = await this.requests.findOpenByContact(
      ContactPhone.create(phone),
      email ? ContactEmail.create(email) : undefined,
    );
    return request?.status === "APPROVED";
  }
}
