import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import type { YearOutcome } from "../../../domain/catechesis.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import { attendanceTotals, type AttendanceEntry } from "../../../domain/class-attendance.js";
import {
  CatechumenNotFoundError,
  NotAClassMemberError,
} from "../../../domain/errors/catechesis.errors.js";
import {
  averageGrade,
  suggestOutcome,
  validateGrades,
  type Evaluation,
  type Grades,
} from "../../../domain/evaluation.js";
import type {
  AttendanceRepository,
  EvaluationRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechistClass, CatechistClassResolver } from "../../catechist-class.js";
import { toMemberView, type CatechumenFileView, type EvaluationRowView } from "../../views.js";

/** Presenças de cada catequizando da turma (a partir das chamadas lançadas). */
async function attendanceByMember(attendance: AttendanceRepository, { klass }: CatechistClass) {
  const byMember = new Map<string, AttendanceEntry[]>();
  for (const sheet of await attendance.listForClass(klass.id.value)) {
    for (const mark of sheet.marks) {
      const list = byMember.get(mark.catechumenId) ?? [];
      list.push({ date: sheet.date, status: mark.status });
      byMember.set(mark.catechumenId, list);
    }
  }
  return byMember;
}

function toRow(
  member: Catechumen,
  entries: AttendanceEntry[],
  evaluation?: Evaluation,
): EvaluationRowView {
  const grades = evaluation?.grades ?? {};
  const average = averageGrade(grades);
  const attendanceRate = attendanceTotals(entries).rate;
  return {
    ...toMemberView(member),
    attendanceRate,
    grades,
    outcome: evaluation?.outcome,
    average,
    suggested: suggestOutcome(average, attendanceRate),
  };
}

/** Uma linha por catequizando da turma. */
async function evaluationRows(
  found: CatechistClass,
  attendance: AttendanceRepository,
  evaluations: EvaluationRepository,
): Promise<EvaluationRowView[]> {
  const [entries, saved] = await Promise.all([
    attendanceByMember(attendance, found),
    evaluations.listForClass(found.klass.id.value),
  ]);
  const byMember = new Map(saved.map((item) => [item.catechumenId, item]));
  return found.members.map((member) =>
    toRow(member, entries.get(member.id.value) ?? [], byMember.get(member.id.value)),
  );
}

/** Pauta da turma: notas por trimestre, presença e decisão final. */
export class GetEvaluationsUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
  ) {}

  async execute({ accountId }: { accountId: string }): Promise<EvaluationRowView[]> {
    const found = await this.resolver.require(accountId);
    return evaluationRows(found, this.attendance, this.evaluations);
  }
}

export interface SaveEvaluationsInput {
  accountId: string;
  rows: { catechumenId: string; grades: Grades; outcome?: YearOutcome }[];
}

/** Guarda as notas e as decisões de alguns (ou todos) os catequizandos da turma. */
export class SaveEvaluationsUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ accountId, rows }: SaveEvaluationsInput): Promise<EvaluationRowView[]> {
    const found = await this.resolver.require(accountId);
    const members = new Set(found.members.map((member) => member.id.value));
    const ids = new Set(rows.map((row) => row.catechumenId));
    if (ids.size !== rows.length || [...ids].some((id) => !members.has(id))) {
      throw new NotAClassMemberError();
    }
    const now = this.clock.now();
    await this.evaluations.saveMany(
      rows.map((row) => ({
        classId: found.klass.id.value,
        catechumenId: row.catechumenId,
        grades: validateGrades(row.grades),
        outcome: row.outcome,
        updatedBy: accountId,
        updatedAt: now,
      })),
    );
    if (rows.length) {
      await this.activity.record({
        actorId: accountId,
        category: "CATECHISTS",
        action: "catechesis.evaluations_saved",
        summary: `Guardou a avaliação de ${rows.length} catequizando${rows.length === 1 ? "" : "s"}`,
      });
    }
    return evaluationRows(found, this.attendance, this.evaluations);
  }
}

/** Ficha de um catequizando da turma: presenças, avaliação e contacto do encarregado. */
export class GetClassCatechumenUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute({
    accountId,
    catechumenId,
  }: {
    accountId: string;
    catechumenId: string;
  }): Promise<CatechumenFileView> {
    const found = await this.resolver.require(accountId);
    const member = found.members.find((item) => item.id.equals(UniqueId.from(catechumenId)));
    if (!member) throw new CatechumenNotFoundError();
    const [entries, evaluations, guardian] = await Promise.all([
      this.attendance.listForCatechumen(found.klass.id.value, catechumenId),
      this.evaluations.listForClass(found.klass.id.value),
      member.guardianAccountId ? this.people.find(member.guardianAccountId) : null,
    ]);
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    return {
      ...toRow(
        member,
        sorted,
        evaluations.find((item) => item.catechumenId === catechumenId),
      ),
      attendance: sorted,
      guardian: guardian
        ? {
            fullName: guardian.fullName,
            relationship: member.guardianRelationship,
            phone: guardian.phone,
          }
        : undefined,
    };
  }
}
