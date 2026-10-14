import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { AttendanceStatus } from "../../../domain/catechesis.js";
import {
  InvalidSessionDateError,
  NotAClassMemberError,
} from "../../../domain/errors/catechesis.errors.js";
import type { AttendanceRepository } from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechistClass, CatechistClassResolver } from "../../catechist-class.js";
import { toMemberView, type RollView } from "../../views.js";

/** O dia tem de ser um encontro da turma e não pode ser no futuro. */
function assertSessionDate({ calendar, klass, today }: CatechistClass, date: string) {
  if (!calendar.isSessionDate(klass.slot, date)) {
    throw new InvalidSessionDateError("Este dia não é um encontro desta turma.");
  }
  if (date > today) {
    throw new InvalidSessionDateError("Só pode lançar presenças de encontros que já aconteceram.");
  }
}

/** Chamada de um encontro (os ainda não marcados vêm a `null`). */
export class GetRollUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
  ) {}

  async execute({ accountId, date }: { accountId: string; date: string }): Promise<RollView> {
    const found = await this.resolver.require(accountId);
    assertSessionDate(found, date);
    const sheet = (await this.attendance.listForClass(found.klass.id.value)).find(
      (item) => item.date === date,
    );
    const status = new Map(sheet?.marks.map((mark) => [mark.catechumenId, mark.status]));
    return {
      date,
      marked: Boolean(sheet),
      members: found.members.map((member) => ({
        ...toMemberView(member),
        status: status.get(member.id.value) ?? null,
      })),
    };
  }
}

export interface SaveRollInput {
  accountId: string;
  date: string;
  marks: { catechumenId: string; status: AttendanceStatus }[];
}

/** Lança (ou corrige) a chamada: todos os catequizandos da turma, cada um uma vez. */
export class SaveRollUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute({ accountId, date, marks }: SaveRollInput): Promise<RollView> {
    const found = await this.resolver.require(accountId);
    assertSessionDate(found, date);
    const members = new Set(found.members.map((member) => member.id.value));
    const marked = new Set(marks.map((mark) => mark.catechumenId));
    if (marked.size !== marks.length || [...marked].some((id) => !members.has(id))) {
      throw new NotAClassMemberError();
    }
    if (marked.size !== members.size) {
      throw new NotAClassMemberError("Marque a presença de todos os catequizandos da turma.");
    }
    await this.attendance.save({
      classId: found.klass.id.value,
      date,
      marks,
      recordedBy: accountId,
      recordedAt: this.clock.now(),
    });
    const present = marks.filter((mark) => mark.status === "PRESENT").length;
    await this.activity.record({
      actorId: accountId,
      category: "CATECHISTS",
      action: "catechesis.attendance_saved",
      summary: `Lançou as presenças de ${date.split("-").reverse().join("/")} (${present}/${marks.length} presentes)`,
    });
    const status = new Map(marks.map((mark) => [mark.catechumenId, mark.status]));
    return {
      date,
      marked: true,
      members: found.members.map((member) => ({
        ...toMemberView(member),
        status: status.get(member.id.value) ?? null,
      })),
    };
  }
}
