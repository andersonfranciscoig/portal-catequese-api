import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type {
  PeopleDirectory,
  PersonSnapshot,
} from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { centerRef, SEDE_CENTER_ID } from "../../../domain/center.js";
import type { CatechesisLevel, SessionSlot } from "../../../domain/catechesis.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import {
  catechistStatus,
  type CatechistStatus,
  type ManualCatechistStatus,
} from "../../../domain/catechist-records.js";
import {
  CalendarNotDefinedError,
  CenterForbiddenError,
  NotAnApprovedCatechistError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechistPresenceRepository,
  CatechistProfileRepository,
  CenterRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { assertSameCenter, resolveWriteCenter, type CenterScope } from "../../center-scope.js";

export interface CatechistClassRefView {
  id: string;
  level: CatechesisLevel;
  section: string;
  role: "LEAD" | "ASSISTANT";
  enrolled: number;
  slot: SessionSlot;
  startTime?: string;
  catecheticalYear: string;
}

export interface CatechistRowView {
  id: string;
  fullName: string;
  /** Quando a conta foi criada (ISO). */
  since: string;
  status: CatechistStatus;
  phone: string;
  email?: string;
  currentClass?: CatechistClassRefView;
  /** Presença do catequista nos encontros com registo (%). */
  attendanceRate?: number;
  center: { id: string; name: string };
}

export interface CatechistProfileView extends CatechistRowView {
  timeline: { catecheticalYear: string; isCurrent: boolean; classes: CatechistClassRefView[] }[];
  totalCatechumens: number;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Monta as linhas e perfis dos catequistas aprovados (partilhado). */
export class CatechistDirectory {
  constructor(
    private readonly people: PeopleDirectory,
    private readonly classes: ClassRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly profiles: CatechistProfileRepository,
    private readonly presence: CatechistPresenceRepository,
    private readonly calendars: CalendarRepository,
  ) {}

  private async year() {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    return calendar.label;
  }

  private async ref(klass: CatechesisClass, accountId: string): Promise<CatechistClassRefView> {
    return {
      id: klass.id.value,
      level: klass.level,
      section: klass.section,
      role: klass.catechists.find((item) => item.accountId === accountId)?.role ?? "LEAD",
      enrolled: await this.enrollments.countConfirmedInClass(klass.id.value),
      slot: klass.slot,
      startTime: klass.startTime,
      catecheticalYear: klass.catecheticalYear,
    };
  }

  async rows(): Promise<CatechistRowView[]> {
    const year = await this.year();
    const [people, classes, profiles] = await Promise.all([
      this.people.listCatechists(),
      this.classes.listByYear(year),
      this.profiles.list(),
    ]);
    const approved = people.filter((person) => person.catechistApproval === "APPROVED");
    const presence = await this.presence.listForClasses(classes.map((item) => item.id.value));
    const profileOf = new Map(profiles.map((item) => [item.accountId, item]));
    return Promise.all(
      approved.map(async (person) => {
        const klass = classes.find((item) => item.hasCatechist(person.id));
        const records = klass ? presence.filter((item) => item.classId === klass.id.value) : [];
        return {
          ...this.base(person),
          status: catechistStatus(profileOf.get(person.id), Boolean(klass)),
          center: centerRef(profileOf.get(person.id)?.centerId ?? SEDE_CENTER_ID),
          currentClass: klass ? await this.ref(klass, person.id) : undefined,
          attendanceRate: records.length
            ? Math.round(
                (records.filter((item) => item.status === "PRESENT").length / records.length) * 100,
              )
            : undefined,
        };
      }),
    );
  }

  async profile(accountId: string): Promise<CatechistProfileView> {
    const person = await this.people.find(accountId);
    if (person?.catechistApproval !== "APPROVED") throw new NotAnApprovedCatechistError();
    const year = await this.year();
    const [row] = (await this.rows()).filter((item) => item.id === accountId);
    const classes = await this.classes.listForCatechist(accountId);
    const byYear = new Map<string, CatechistClassRefView[]>();
    let totalCatechumens = 0;
    for (const klass of classes) {
      const ref = await this.ref(klass, accountId);
      totalCatechumens += ref.enrolled;
      byYear.set(klass.catecheticalYear, [...(byYear.get(klass.catecheticalYear) ?? []), ref]);
    }
    return {
      ...(row ?? {
        ...this.base(person),
        status: "AVAILABLE" as const,
        center: centerRef(SEDE_CENTER_ID),
      }),
      timeline: [...byYear.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([catecheticalYear, refs]) => ({
          catecheticalYear,
          isCurrent: catecheticalYear === year,
          classes: refs,
        })),
      totalCatechumens,
    };
  }

  private base(person: PersonSnapshot) {
    return {
      id: person.id,
      fullName: person.fullName,
      since: person.createdAt,
      phone: person.phone,
      email: person.email,
    };
  }
}

export type CatechistTab =
  "todos" | "ativos" | "disponiveis" | "em-formacao" | "indisponiveis" | "inativos";

const TAB_STATUS: Record<CatechistTab, CatechistStatus | null> = {
  todos: null,
  ativos: "ACTIVE",
  disponiveis: "AVAILABLE",
  "em-formacao": "IN_TRAINING",
  indisponiveis: "UNAVAILABLE",
  inativos: "INACTIVE",
};

/** Catequistas aprovados por estado, com a turma do ano e os números de cada separador. */
export class ListCatechistsUseCase {
  constructor(private readonly directory: CatechistDirectory) {}

  async execute({
    tab = "todos",
    search = "",
    centerId,
  }: {
    tab?: CatechistTab;
    search?: string;
    centerId?: string;
  }) {
    const query = normalize(search.trim());
    const rows = (await this.directory.rows())
      .filter((row) => !centerId || row.center.id === centerId)
      .filter(
        (row) =>
          !query || normalize(`${row.fullName} ${row.email ?? ""} ${row.phone}`).includes(query),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
    const counts = Object.fromEntries(
      (Object.keys(TAB_STATUS) as CatechistTab[]).map((key) => [
        key,
        rows.filter((row) => !TAB_STATUS[key] || row.status === TAB_STATUS[key]).length,
      ]),
    ) as Record<CatechistTab, number>;
    return {
      items: rows.filter((row) => !TAB_STATUS[tab] || row.status === TAB_STATUS[tab]),
      counts,
    };
  }
}

export class GetCatechistProfileUseCase {
  constructor(private readonly directory: CatechistDirectory) {}

  async execute({ accountId, scope }: { accountId: string; scope?: CenterScope }) {
    const view = await this.directory.profile(accountId);
    assertSameCenter(scope, view.center.id);
    return view;
  }
}

const STATUS_LABEL: Record<ManualCatechistStatus, string> = {
  IN_TRAINING: "em formação",
  UNAVAILABLE: "indisponível",
  INACTIVE: "inativo",
};

/** A coordenação marca o catequista em formação, indisponível ou inativo (ou retira). */
export class SetCatechistStatusUseCase {
  constructor(
    private readonly people: PeopleDirectory,
    private readonly profiles: CatechistProfileRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly centers?: CenterRepository,
  ) {}

  async execute({
    actorId,
    accountId,
    status,
    centerId,
    scope,
  }: {
    actorId: string;
    accountId: string;
    status: ManualCatechistStatus | null;
    centerId?: string;
    scope?: CenterScope;
  }): Promise<void> {
    const person = await this.people.find(accountId);
    if (person?.catechistApproval !== "APPROVED") throw new NotAnApprovedCatechistError();
    const existing = await this.profiles.find(accountId);
    if (
      scope?.kind === "center" &&
      existing?.centerId &&
      existing.centerId !== scope.centerId
    ) {
      throw new CenterForbiddenError();
    }
    const resolved =
      scope || centerId || !existing?.centerId
        ? await resolveWriteCenter(
            this.centers,
            scope,
            centerId ?? (scope ? undefined : existing?.centerId),
          )
        : existing.centerId;
    await this.profiles.save({
      accountId,
      status: status ?? undefined,
      centerId: resolved || SEDE_CENTER_ID,
      updatedAt: this.clock.now(),
      updatedBy: actorId,
    });
    await this.activity.record({
      actorId,
      category: "CATECHISTS",
      action: "catechesis.catechist_status_changed",
      summary: status
        ? `Marcou ${person.fullName} como ${STATUS_LABEL[status]}`
        : `Retirou o estado de ${person.fullName} (volta a ativo ou disponível)`,
      targetAccountId: accountId,
    });
  }
}
