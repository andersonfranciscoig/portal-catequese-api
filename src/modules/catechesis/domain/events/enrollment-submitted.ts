import {
  ENROLLMENT_SUBMITTED,
  type EnrollmentSubmittedEvent,
} from "../../../../shared/application/integration-events.js";
import type { Catechumen } from "../catechumen.js";
import type { Enrollment } from "../enrollment.js";

/** Matrícula ou confirmação submetida (os pagamentos criam a taxa). */
export class EnrollmentSubmitted implements EnrollmentSubmittedEvent {
  readonly name = ENROLLMENT_SUBMITTED;
  readonly aggregateId: string;
  readonly enrollmentCode: string;
  readonly catechumenName: string;
  readonly purpose: "ENROLLMENT" | "CONFIRMATION";
  readonly payerAccountIds: string[];
  readonly occurredAt: Date;

  constructor(enrollment: Enrollment, catechumen: Catechumen) {
    this.aggregateId = enrollment.id.value;
    this.enrollmentCode = enrollment.code;
    this.catechumenName = catechumen.fullName;
    this.purpose = enrollment.type === "RENEWAL" ? "CONFIRMATION" : "ENROLLMENT";
    this.payerAccountIds = [
      ...new Set(
        [catechumen.guardianAccountId, catechumen.accountId, enrollment.submittedBy].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    this.occurredAt = enrollment.submittedAt;
  }
}
