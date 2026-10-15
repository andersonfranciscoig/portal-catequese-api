import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import type { AttendanceStatus } from "../../../domain/catechesis.js";
import {
  InvalidSessionDateError,
  NotAClassMemberError,
} from "../../../domain/errors/catechesis.errors.js";
import type { AttendanceRepository } from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechistClass, CatechistClassResolver } from "../../catechist-class.js";
import { firstName, shortDate } from "../../messages.js";
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
    private readonly notifier: Notifier,
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
    const previous = (await this.attendance.listForClass(found.klass.id.value)).find(
      (sheet) => sheet.date === date,
    );
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
    await this.notifyNewAbsences(found, date, marks, previous?.marks ?? []);
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

  /** Avisa a família de cada falta nova (uma correção da chamada não repete o aviso). */
  private async notifyNewAbsences(
    { members }: CatechistClass,
    date: string,
    marks: SaveRollInput["marks"],
    previous: SaveRollInput["marks"],
  ) {
    const before = new Map(previous.map((mark) => [mark.catechumenId, mark.status]));
    const absent = marks.filter(
      (mark) => mark.status === "ABSENT" && before.get(mark.catechumenId) !== "ABSENT",
    );
    for (const mark of absent) {
      const member = members.find((item) => item.id.value === mark.catechumenId);
      if (member?.accountId) {
        await this.notifier.notify({
          to: { accountIds: [member.accountId] },
          kind: "catechesis.absence",
          title: `Falta no encontro de ${shortDate(date)}`,
          body: "Se faltou por um motivo justificado, avise o seu catequista.",
          link: "/portal",
        });
      }
      if (member?.guardianAccountId) {
        await this.notifier.notify({
          to: { accountIds: [member.guardianAccountId] },
          kind: "catechesis.absence",
          title: `${firstName(member.fullName)} faltou ao encontro de ${shortDate(date)}`,
          body: "Se a falta tem justificação, avise o catequista.",
          link: `/portal/educandos/${member.id.value}`,
        });
      }
    }
  }
}
