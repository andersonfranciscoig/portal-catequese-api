import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import { centerRef } from "../../../domain/center.js";
import type {
  AttendanceRepository,
  CenterTransferRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechistClassResolver } from "../../catechist-class.js";
import { toClassViews, toMemberView, type MyClassView } from "../../views.js";

/** Portal do catequista: a turma, os catequizandos e os encontros já realizados. */
export class GetMyClassUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
    private readonly people: PeopleDirectory,
    private readonly transfers: CenterTransferRepository,
  ) {}

  async execute({ accountId }: { accountId: string }): Promise<MyClassView> {
    const found = await this.resolver.find(accountId);
    if (!found.klass) {
      return { catecheticalYear: found.calendar.label, class: null, members: [], sessions: [] };
    }
    const { calendar, klass, members, today } = found;
    const [view] = await toClassViews([klass], this.people, calendar, today);
    const marked = new Map(
      (await this.attendance.listForClass(klass.id.value)).map((sheet) => [sheet.date, sheet]),
    );
    const sessions = calendar
      .sessionDates(klass.slot, today)
      .map((date) => {
        const sheet = marked.get(date);
        return {
          date,
          marked: Boolean(sheet),
          present: sheet?.marks.filter((mark) => mark.status === "PRESENT").length ?? 0,
          total: sheet?.marks.length ?? members.length,
        };
      })
      .reverse();
    return {
      catecheticalYear: calendar.label,
      class: view,
      members: await this.withOrigins(members.map(toMemberView)),
      sessions,
      nextSessionDate: view.nextSessionDate,
    };
  }

  private async withOrigins(members: ReturnType<typeof toMemberView>[]) {
    const arrivals = await this.transfers.list({ status: "APPROVED" });
    const byCatechumen = new Map<string, string>();
    for (const item of arrivals) {
      if (item.kind === "CATECHUMEN" && item.catechumenId && !byCatechumen.has(item.catechumenId)) {
        byCatechumen.set(item.catechumenId, item.fromCenterId);
      }
    }
    return members.map((member) => {
      const from = byCatechumen.get(member.id);
      return from ? { ...member, fromCenter: centerRef(from) } : member;
    });
  }
}
