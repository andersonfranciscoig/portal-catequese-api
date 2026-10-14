import type { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { AccessRequest, AccessRequestStatus } from "../access-request.js";
import type { ContactEmail, ContactPhone } from "../value-objects/contact.js";

export abstract class AccessRequestRepository {
  abstract findById(id: UniqueId): Promise<AccessRequest | null>;
  /** Pedidos ainda válidos (por decidir ou aceites) com este telefone ou email. */
  abstract findOpenByContact(
    phone: ContactPhone,
    email?: ContactEmail,
  ): Promise<AccessRequest | null>;
  abstract list(status?: AccessRequestStatus): Promise<AccessRequest[]>;
  abstract countPending(): Promise<number>;
  abstract save(request: AccessRequest): Promise<void>;
}
