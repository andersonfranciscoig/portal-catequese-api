import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { AttendanceRepository } from "../../../domain/repositories/catechesis.repositories.js";
import type { CatechistClassResolver } from "../../catechist-class.js";
import { toClassViews, toMemberView, type MyClassView } from "../../views.js";

/** Portal do catequista: a turma, os catequizandos e os encontros já realizados. */
export class GetMyClassUseCase {
  constructor(
    private readonly resolver: CatechistClassResolver,
    private readonly attendance: AttendanceRepository,
    private readonly people: PeopleDirectory,
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
      members: members.map(toMemberView),
      sessions,
      nextSessionDate: view.nextSessionDate,
    };
  }
}
