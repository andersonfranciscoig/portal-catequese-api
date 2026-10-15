import { UniqueId } from "../../../shared/domain/unique-id.js";
import type { Catechumen } from "../domain/catechumen.js";
import type { Enrollment } from "../domain/enrollment.js";
import { EnrollmentNotFoundError } from "../domain/errors/catechesis.errors.js";
import type {
  CatechumenRepository,
  EnrollmentRepository,
} from "../domain/repositories/catechesis.repositories.js";

/**
 * A matrícula, se for de um catequizando da conta (educando ou o próprio).
 * Sem acesso responde como se não existisse (não revela ids de outras famílias).
 */
export async function loadFamilyEnrollment(
  enrollments: EnrollmentRepository,
  catechumens: CatechumenRepository,
  accountId: string,
  enrollmentId: string,
): Promise<{ enrollment: Enrollment; catechumen: Catechumen }> {
  const enrollment = await enrollments.findById(UniqueId.from(enrollmentId));
  const catechumen = enrollment
    ? await catechumens.findById(UniqueId.from(enrollment.catechumenId))
    : null;
  if (!enrollment || !catechumen?.isAccessibleBy(accountId)) throw new EnrollmentNotFoundError();
  return { enrollment, catechumen };
}
