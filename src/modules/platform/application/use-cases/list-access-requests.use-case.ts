import type { AccessRequestStatus } from "../../domain/access-request.js";
import type { AccessRequestRepository } from "../../domain/repositories/access-request.repository.js";
import { toAccessRequestView, type AccessRequestView } from "../views.js";

export class ListAccessRequestsUseCase {
  constructor(private readonly requests: AccessRequestRepository) {}

  async execute({ status }: { status?: AccessRequestStatus }): Promise<AccessRequestView[]> {
    return (await this.requests.list(status)).map(toAccessRequestView);
  }
}
