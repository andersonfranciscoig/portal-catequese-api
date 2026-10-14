import { DomainError } from "../../../shared/domain/domain-error.js";

export class NotificationNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "notifications.not_found";
  constructor() {
    super("Notificação não encontrada.");
  }
}
