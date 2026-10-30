import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import {
  EnrollmentStatus,
  formatLevel,
  stageOf,
  type CatechesisLevel,
  type CatechesisStage,
  type EnrollmentType,
  type Gender,
  type GuardianRelationship,
  type SessionSlot,
} from "../../../domain/catechesis.js";
import type { CatechesisClass } from "../../../domain/catechesis-class.js";
import type { Catechumen } from "../../../domain/catechumen.js";
import type { Enrollment } from "../../../domain/enrollment.js";
import { centerRef } from "../../../domain/center.js";
import {
  assertSameCenter,
  matchesCenter,
  type CenterScope,
} from "../../center-scope.js";
import {
  CalendarNotDefinedError,
  ClassFullError,
  ClassNotFoundError,
  EnrollmentNotFoundError,
  InvalidEnrollmentError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CalendarRepository,
  CatechumenRepository,
  ClassRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { classLabel, classSchedule, firstName } from "../../messages.js";
import {
  toDocumentView,
  type EnrollmentDocumentView,
} from "../documents/enrollment-documents.use-cases.js";

/* ───────────── Lista (separadores, pesquisa, páginas) ───────────── */

const S = EnrollmentStatus;
/** Os separadores da gestão de matrículas (o mesmo que o portal mostra). */
export const ENROLLMENT_TABS = {
  todas: null,
  "em-analise": [S.SUBMITTED, S.UNDER_REVIEW],
  aprovadas: [S.APPROVED],
  pendentes: [S.PENDING_CONFIRMATION],
  confirmadas: [S.CONFIRMED],
  rejeitadas: [S.REJECTED],
  "lista-de-espera": [S.WAITLIST],
} as const satisfies Record<string, readonly EnrollmentStatus[] | null>;
export type EnrollmentTab = keyof typeof ENROLLMENT_TABS;

export interface EnrollmentListQuery {
  tab: EnrollmentTab;
  search?: string;
  stage?: CatechesisStage;
  type?: EnrollmentType;
  sort: "recentes" | "antigas" | "nome";
  page: number;
  pageSize: number;
  centerId?: string;
}

export interface EnrollmentRowView {
  id: string;
  code: string;
  catechumenId: string;
  catechumenName: string;
  birthDate: string;
  level: CatechesisLevel;
  stage: CatechesisStage;
  type: EnrollmentType;
  status: EnrollmentStatus;
  submittedAt: string;
  guardianName?: string;
  classId?: string;
  classLabel?: string;
  center: { id: string; name: string };
}

export interface EnrollmentPageView {
  items: EnrollmentRowView[];
  total: number;
  page: number;
  pageCount: number;
  counts: Record<EnrollmentTab, number>;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Dados que as vistas da coordenação juntam a cada matrícula. */
interface Context {
  catechumens: Map<string, Catechumen>;
  guardians: Map<string, string>;
  classes: Map<string, CatechesisClass>;
}

function toRow(enrollment: Enrollment, ctx: Context): EnrollmentRowView {
  const catechumen = ctx.catechumens.get(enrollment.catechumenId);
  const klass = enrollment.classId ? ctx.classes.get(enrollment.classId) : undefined;
  return {
    id: enrollment.id.value,
    code: enrollment.code,
    catechumenId: enrollment.catechumenId,
    catechumenName: catechumen?.fullName ?? "—",
    birthDate: catechumen?.birthDate ?? "",
    level: enrollment.level,
    stage: stageOf(enrollment.level),
    type: enrollment.type,
    status: enrollment.status,
    submittedAt: enrollment.submittedAt.toISOString(),
    guardianName: catechumen?.guardianAccountId
      ? ctx.guardians.get(catechumen.guardianAccountId)
      : undefined,
    classId: enrollment.isConfirmed ? enrollment.classId : undefined,
    classLabel: enrollment.isConfirmed && klass ? `Turma ${klass.section}` : undefined,
    center: centerRef(enrollment.centerId),
  };
}

/** Matrículas do ano em curso, com os números de cada separador. */
export class ListEnrollmentsUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute(query: EnrollmentListQuery): Promise<EnrollmentPageView> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const all = (await this.enrollments.list({ catecheticalYear: calendar.label })).filter((item) =>
      matchesCenter(item.centerId, query.centerId),
    );
    const catechumens = new Map(
      (await this.catechumens.findByIds(all.map((item) => item.catechumenId))).map((item) => [
        item.id.value,
        item,
      ]),
    );
    const guardians = new Map(
      (
        await this.people.findMany(
          [...catechumens.values()].flatMap((item) =>
            item.guardianAccountId ? [item.guardianAccountId] : [],
          ),
        )
      ).map((person) => [person.id, person.fullName]),
    );
    const classes = new Map(
      (await this.classes.listByYear(calendar.label)).map((item) => [item.id.value, item]),
    );
    const ctx = { catechumens, guardians, classes };

    const search = normalize(query.search?.trim() ?? "");
    const filtered = all
      .filter((item) => !query.stage || stageOf(item.level) === query.stage)
      .filter((item) => !query.type || item.type === query.type)
      .map((item) => toRow(item, ctx))
      .filter(
        (row) =>
          !search ||
          [row.code, row.catechumenName, row.guardianName ?? ""].some((value) =>
            normalize(value).includes(search),
          ),
      );

    const inTab = (row: EnrollmentRowView, tab: EnrollmentTab) => {
      const statuses: readonly EnrollmentStatus[] | null = ENROLLMENT_TABS[tab];
      return !statuses || statuses.includes(row.status);
    };
    const counts = Object.fromEntries(
      (Object.keys(ENROLLMENT_TABS) as EnrollmentTab[]).map((tab) => [
        tab,
        filtered.filter((row) => inTab(row, tab)).length,
      ]),
    ) as Record<EnrollmentTab, number>;

    const rows = filtered.filter((row) => inTab(row, query.tab));
    rows.sort((a, b) => {
      if (query.sort === "nome") return a.catechumenName.localeCompare(b.catechumenName, "pt");
      const byDate = a.submittedAt.localeCompare(b.submittedAt) || a.code.localeCompare(b.code);
      return query.sort === "antigas" ? byDate : -byDate;
    });
    const pageCount = Math.max(1, Math.ceil(rows.length / query.pageSize));
    const page = Math.min(Math.max(1, query.page), pageCount);
    return {
      items: rows.slice((page - 1) * query.pageSize, page * query.pageSize),
      total: rows.length,
      page,
      pageCount,
      counts,
    };
  }
}

/* ───────────── Detalhe ───────────── */

export interface EnrollmentDetailView extends EnrollmentRowView {
  gender: Gender;
  address?: string;
  sacraments: { baptism: boolean; firstCommunion: boolean };
  preferredSlot: SessionSlot;
  previousParish?: string;
  notes?: string;
  reviewNote?: string;
  guardian?: {
    fullName: string;
    phone: string;
    email?: string;
    relationship?: GuardianRelationship;
  };
  /** Adulto inscrito por si: o contacto da própria conta. */
  applicant?: { fullName: string; phone: string; email?: string };
  documentsInPerson: boolean;
  documents: EnrollmentDocumentView[];
  history: { status: EnrollmentStatus; at: string; note?: string; actorName?: string }[];
  classOptions: {
    id: string;
    section: string;
    slot: SessionSlot;
    startTime?: string;
    room: string;
    capacity: number;
    enrolled: number;
    catechistName?: string;
  }[];
}

export class GetEnrollmentDetailUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly documents: EnrollmentDocumentRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async execute({
    enrollmentId,
    scope,
  }: {
    enrollmentId: string;
    scope?: CenterScope;
  }): Promise<EnrollmentDetailView> {
    const enrollment = await this.enrollments.findById(UniqueId.from(enrollmentId));
    if (!enrollment) throw new EnrollmentNotFoundError();
    assertSameCenter(scope, enrollment.centerId);
    const catechumen = await this.catechumens.findById(UniqueId.from(enrollment.catechumenId));
    if (!catechumen) throw new EnrollmentNotFoundError();

    const options = (await this.classes.listByYear(enrollment.catecheticalYear)).filter(
      (klass) => klass.level === enrollment.level && klass.centerId === enrollment.centerId,
    );
    const ids = [
      catechumen.guardianAccountId,
      catechumen.accountId,
      ...enrollment.history.map((event) => event.actorId),
      ...options.flatMap((klass) => (klass.lead ? [klass.lead.accountId] : [])),
    ].filter((id): id is string => Boolean(id));
    const people = new Map((await this.people.findMany(ids)).map((item) => [item.id, item]));
    const guardian = catechumen.guardianAccountId
      ? people.get(catechumen.guardianAccountId)
      : undefined;
    const adult = catechumen.accountId ? people.get(catechumen.accountId) : undefined;
    const [documents, enrolled] = await Promise.all([
      this.documents.listForEnrollment(enrollment.id.value),
      Promise.all(options.map((klass) => this.enrollments.countConfirmedInClass(klass.id.value))),
    ]);
    const classes = new Map(options.map((klass) => [klass.id.value, klass]));
    if (enrollment.classId && !classes.has(enrollment.classId)) {
      const own = await this.classes.findById(UniqueId.from(enrollment.classId));
      if (own) classes.set(own.id.value, own);
    }

    return {
      ...toRow(enrollment, {
        catechumens: new Map([[catechumen.id.value, catechumen]]),
        guardians: new Map(guardian ? [[guardian.id, guardian.fullName]] : []),
        classes,
      }),
      gender: catechumen.gender,
      address: catechumen.address,
      sacraments: { baptism: catechumen.baptized, firstCommunion: catechumen.firstCommunion },
      preferredSlot: enrollment.preferredSlot,
      previousParish: enrollment.previousParish,
      notes: enrollment.notes,
      reviewNote: enrollment.reviewNote,
      guardian: guardian
        ? {
            fullName: guardian.fullName,
            phone: guardian.phone,
            email: guardian.email,
            relationship: catechumen.guardianRelationship,
          }
        : undefined,
      applicant: adult
        ? { fullName: adult.fullName, phone: adult.phone, email: adult.email }
        : undefined,
      documentsInPerson: enrollment.documentsInPerson,
      documents: documents.map(toDocumentView),
      history: enrollment.history.map((event) => ({
        status: event.status,
        at: event.at.toISOString(),
        note: event.note,
        actorName: event.actorId ? people.get(event.actorId)?.fullName : undefined,
      })),
      classOptions: options.map((klass, index) => ({
        id: klass.id.value,
        section: klass.section,
        slot: klass.slot,
        startTime: klass.startTime,
        room: klass.room,
        capacity: klass.capacity,
        enrolled: enrolled[index],
        catechistName: klass.lead ? people.get(klass.lead.accountId)?.fullName : undefined,
      })),
    };
  }
}

/* ───────────── Ações ───────────── */

export type EnrollmentAction =
  | { kind: "approve" }
  | { kind: "request-documents"; note?: string }
  | { kind: "confirm"; classId: string }
  | { kind: "reject"; reason?: string }
  | { kind: "waitlist" }
  | { kind: "reopen" };

const ACTION_SUMMARY: Record<EnrollmentAction["kind"], string> = {
  approve: "Aprovou",
  "request-documents": "Pediu documentos para",
  confirm: "Confirmou",
  reject: "Recusou",
  waitlist: "Pôs em lista de espera",
  reopen: "Reabriu",
};

/**
 * A coordenação decide a matrícula: aprovar, pedir documentos, confirmar numa
 * turma (do mesmo nível e ano, com lugar), recusar, lista de espera ou reabrir.
 * A família é avisada do que lhe interessa.
 */
export class EnrollmentActionUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute({
    actorId,
    enrollmentId,
    action,
    scope,
  }: {
    actorId: string;
    enrollmentId: string;
    action: EnrollmentAction;
    scope?: CenterScope;
  }): Promise<{ status: EnrollmentStatus; classId?: string }> {
    const enrollment = await this.enrollments.findById(UniqueId.from(enrollmentId));
    if (!enrollment) throw new EnrollmentNotFoundError();
    assertSameCenter(scope, enrollment.centerId);
    const catechumen = await this.catechumens.findById(UniqueId.from(enrollment.catechumenId));
    const name = catechumen?.fullName ?? "—";
    const now = this.clock.now();
    let detail = "";

    switch (action.kind) {
      case "approve":
        enrollment.approve(actorId, now);
        break;
      case "request-documents":
        enrollment.requestDocuments(actorId, now, action.note);
        break;
      case "waitlist":
        enrollment.waitlist(actorId, now);
        break;
      case "reopen":
        enrollment.reopen(actorId, now);
        break;
      case "reject":
        enrollment.reject(actorId, now, action.reason);
        break;
      case "confirm": {
        const klass = await this.classes.findById(UniqueId.from(action.classId));
        if (!klass) throw new ClassNotFoundError();
        if (
          klass.level !== enrollment.level ||
          klass.catecheticalYear !== enrollment.catecheticalYear
        ) {
          throw new InvalidEnrollmentError("A turma tem de ser do mesmo nível e ano da matrícula.");
        }
        if (klass.centerId !== enrollment.centerId) {
          throw new InvalidEnrollmentError("A turma tem de ser do mesmo centro da matrícula.");
        }
        if ((await this.enrollments.countConfirmedInClass(klass.id.value)) >= klass.capacity) {
          throw new ClassFullError();
        }
        enrollment.confirm(klass.id.value, actorId, now, `Turma ${klass.section}`);
        detail = ` em ${classLabel(klass)}`;
        await this.enrollments.save(enrollment);
        await this.record(actorId, action, name, enrollment, detail);
        await this.notifyFamily(enrollment, catechumen, actorId, {
          kind: "catechesis.enrollment_confirmed",
          title: `Matrícula de ${firstName(name)} confirmada`,
          body: `${classLabel(klass)} · ${classSchedule(klass)}`,
        });
        return { status: enrollment.status, classId: enrollment.classId };
      }
    }
    await this.enrollments.save(enrollment);
    await this.record(actorId, action, name, enrollment, detail);

    const message = this.familyMessage(action, enrollment, name);
    if (message) await this.notifyFamily(enrollment, catechumen, actorId, message);
    return { status: enrollment.status, classId: enrollment.classId };
  }

  private familyMessage(action: EnrollmentAction, enrollment: Enrollment, name: string) {
    const level = `${formatLevel(enrollment.level)} (${enrollment.code})`;
    switch (action.kind) {
      case "approve":
        return {
          kind: "catechesis.enrollment_approved",
          title: `Matrícula de ${firstName(name)} aprovada`,
          body: `${level}. Falta só a coordenação atribuir a turma.`,
        };
      case "request-documents":
        return {
          kind: "catechesis.documents_requested",
          title: `Faltam documentos na matrícula de ${firstName(name)}`,
          body: action.note ?? "Envie os documentos em falta no portal ou na secretaria.",
          link: "/portal/matriculas",
        };
      case "waitlist":
        return {
          kind: "catechesis.enrollment_waitlisted",
          title: `Matrícula de ${firstName(name)} em lista de espera`,
          body: `${level}. Avisamos quando houver lugar numa turma.`,
          link: "/portal/matriculas",
        };
      case "reject":
        return {
          kind: "catechesis.enrollment_rejected",
          title: `Matrícula de ${firstName(name)} não foi aceite`,
          body: action.reason
            ? `${level}. Motivo: ${action.reason}`
            : `${level}. Para saber mais, fale com a secretaria da catequese.`,
          link: "/portal/matriculas",
        };
      default:
        return null;
    }
  }

  private async record(
    actorId: string,
    action: EnrollmentAction,
    name: string,
    enrollment: Enrollment,
    detail: string,
  ) {
    await this.activity.record({
      actorId,
      category: "ENROLLMENT",
      action: `catechesis.enrollment_${action.kind.replace("-", "_")}`,
      summary: `${ACTION_SUMMARY[action.kind]} a matrícula de ${name} (${enrollment.code})${detail}`,
    });
  }

  /**
   * Avisa quem acompanha o catequizando: o próprio adulto (no seu portal) e o
   * encarregado ou quem submeteu (no perfil do educando).
   */
  private async notifyFamily(
    enrollment: Enrollment,
    catechumen: Catechumen | null,
    actorId: string,
    message: { kind: string; title: string; body: string; link?: string },
  ) {
    const adult = catechumen?.accountId;
    const guardians = [...new Set([catechumen?.guardianAccountId, enrollment.submittedBy])].filter(
      (id): id is string => Boolean(id) && id !== adult,
    );
    if (adult) {
      await this.notifier.notify({
        ...message,
        to: { accountIds: [adult] },
        link: message.link ?? "/portal",
        exceptAccountId: actorId,
      });
    }
    if (guardians.length) {
      await this.notifier.notify({
        ...message,
        to: { accountIds: guardians },
        link: message.link ?? `/portal/educandos/${enrollment.catechumenId}`,
        exceptAccountId: actorId,
      });
    }
  }
}
