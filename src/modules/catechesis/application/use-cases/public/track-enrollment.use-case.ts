import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { CatechesisLevel, EnrollmentStatus, SessionSlot } from "../../../domain/catechesis.js";
import { EnrollmentNotFoundError } from "../../../domain/errors/catechesis.errors.js";
import type {
  CatechumenRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";

/** O que qualquer pessoa vê com o número da matrícula (sem dados pessoais completos). */
export interface EnrollmentTrackingView {
  code: string;
  status: EnrollmentStatus;
  /** Só o primeiro nome e a inicial do apelido ("Inês F."). */
  catechumenName: string;
  level: CatechesisLevel;
  catecheticalYear: string;
  submittedAt: string;
  updatedAt: string;
  /** Com a matrícula confirmada: turma, horário e sala (sem nomes de pessoas além do catequista). */
  classInfo?: {
    level: CatechesisLevel;
    section: string;
    slot: SessionSlot;
    startTime?: string;
    room: string;
    catechist?: string;
  };
}

const CODE = /^CRP-\d{4}-\d{5}$/;

/** "Inês Francisco Kiala" → "Inês K." (o nome completo só a família vê). */
function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0];
}

/** Acompanhamento público pelo número da matrícula. */
export class TrackEnrollmentUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute({ code }: { code: string }): Promise<EnrollmentTrackingView> {
    const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!CODE.test(normalized)) throw new EnrollmentNotFoundError("Número de matrícula inválido.");
    const enrollment = await this.enrollments.findByCode(normalized);
    if (!enrollment)
      throw new EnrollmentNotFoundError("Não encontrámos nenhuma matrícula com este número.");
    const catechumen = await this.catechumens.findById(UniqueId.from(enrollment.catechumenId));
    const klass =
      enrollment.isConfirmed && enrollment.classId
        ? await this.classes.findById(UniqueId.from(enrollment.classId))
        : null;
    const lead = klass?.lead ? await this.people.find(klass.lead.accountId) : null;
    return {
      code: enrollment.code,
      status: enrollment.status,
      catechumenName: catechumen ? shortName(catechumen.fullName) : "—",
      level: enrollment.level,
      catecheticalYear: enrollment.catecheticalYear,
      submittedAt: enrollment.submittedAt.toISOString(),
      updatedAt: enrollment.updatedAt.toISOString(),
      classInfo: klass
        ? {
            level: klass.level,
            section: klass.section,
            slot: klass.slot,
            startTime: klass.startTime,
            room: klass.room,
            catechist: lead?.fullName,
          }
        : undefined,
    };
  }
}
