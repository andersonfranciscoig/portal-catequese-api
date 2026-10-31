import type { ActivityRecorder } from "../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../shared/application/notifier.js";
import type { PeopleDirectory } from "../../../../shared/application/people-directory.js";
import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import { AccountRepository } from "../../../identity/index.js";
import { ClassCatechistRole, type CatechesisLevel, type SessionSlot } from "../../domain/catechesis.js";
import type { CatechesisClass } from "../../domain/catechesis-class.js";
import { CenterTransferRequest, type CenterTransferKind, type CenterTransferStatus } from "../../domain/center-transfer.js";
import { centerRef } from "../../domain/center.js";
import {
  CalendarNotDefinedError,
  CatechumenNotFoundError,
  CenterForbiddenError,
  CenterInactiveError,
  CenterNotFoundError,
  CenterTransferAlreadyOpenError,
  CenterTransferNotFoundError,
  ClassNotFoundError,
  InvalidCenterTransferError,
  NoCenterVacancyError,
} from "../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechistProfileRepository,
  CatechumenRepository,
  CenterRepository,
  CenterTransferRepository,
  ClassRepository,
  EnrollmentRepository,
} from "../../domain/repositories/catechesis.repositories.js";
import { CatechesisAccess } from "../catechesis-access.js";
import { type CenterScope } from "../center-scope.js";
import { attendanceTotals } from "../../domain/class-attendance.js";
import { classLabel } from "../messages.js";

const MAX_CATECHISTS = 5;

export interface CenterTransferView {
  id: string;
  kind: CenterTransferKind;
  status: CenterTransferStatus;
  requestedBy: { id: string; fullName: string };
  subjectName: string;
  fromCenter: { id: string; name: string };
  toCenter: { id: string; name: string };
  reason: string;
  catechumenId?: string;
  enrollmentId?: string;
  fromClass?: { id: string; label: string };
  fromLevel?: CatechesisLevel;
  toClass?: { id: string; label: string };
  catechistRole?: ClassCatechistRole;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: { id: string; fullName: string };
  decisionNote?: string;
  canDecide: boolean;
  canCancel: boolean;
  options?: TransferOptionsView;
}

export interface CatechumenVacancyView {
  classId: string;
  label: string;
  section: string;
  slot: SessionSlot;
  startTime?: string;
  room: string;
  enrolled: number;
  capacity: number;
  vacant: number;
}

export interface CatechistSuggestionView {
  classId: string;
  label: string;
  section: string;
  level: CatechesisLevel;
  sameLevel: boolean;
  slot: SessionSlot;
  startTime?: string;
  room: string;
  enrolled: number;
  capacity: number;
  roles: ClassCatechistRole[];
  priority: number;
}

export interface TransferOptionsView {
  catechumen?: CatechumenVacancyView[];
  catechist?: CatechistSuggestionView[];
  canAcceptWithoutClass: boolean;
}

export interface OriginStayView {
  fromCenter: { id: string; name: string };
  fromClass?: { id: string; section: string; slot?: SessionSlot; startTime?: string };
  attendanceRate?: number;
  reason: string;
  decidedAt: string;
}

function canDecide(scope: CenterScope | undefined, toCenterId: string) {
  return !scope || scope.kind === "parish" || scope.centerId === toCenterId;
}

function canSee(scope: CenterScope | undefined, request: CenterTransferRequest) {
  if (!scope || scope.kind === "parish") return true;
  return scope.centerId === request.fromCenterId || scope.centerId === request.toCenterId;
}

function compatibleClass(origin: CatechesisClass | undefined, dest: CatechesisClass) {
  if (!origin) return dest.kind === "REGULAR";
  if (origin.kind !== dest.kind) return false;
  if (origin.kind === "SPECIAL") return origin.sacrament === dest.sacrament;
  return true;
}

/** Família ou catequista pede para passar a frequentar outro centro. */
export class RequestCenterTransferUseCase {
  constructor(
    private readonly access: CatechesisAccess,
    private readonly transfers: CenterTransferRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly centers: CenterRepository,
    private readonly profiles: CatechistProfileRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute(input: {
    accountId: string;
    toCenterId: string;
    reason: string;
  } & ({ kind: "CATECHUMEN"; catechumenId: string } | { kind: "CATECHIST" })): Promise<CenterTransferView> {
    const destination = await this.centers.findById(input.toCenterId);
    if (!destination) throw new CenterNotFoundError();
    if (!destination.isActive) throw new CenterInactiveError();
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const now = this.clock.now();
    const request =
      input.kind === "CATECHUMEN"
        ? await this.catechumenRequest(input.accountId, input.catechumenId, input.toCenterId, input.reason, calendar.label, now)
        : await this.catechistRequest(input.accountId, input.toCenterId, input.reason, calendar.label, now);
    await this.transfers.save(request);
    const subject =
      request.kind === "CATECHUMEN"
        ? ((await this.catechumens.findById(UniqueId.from(request.catechumenId!)))?.fullName ?? "Catequizando")
        : ((await this.people.find(request.requestedBy))?.fullName ?? "Catequista");
    await this.activity.record({
      actorId: input.accountId,
      category: "CATECHISTS",
      action: "catechesis.center_transfer_requested",
      summary: `${subject} pediu mudança de ${centerRef(request.fromCenterId).name} para ${destination.name}`,
    });
    await this.notifier.notify({
      to: { permission: "COORDINATION" },
      kind: "catechesis.center_transfer_requested",
      title: "Pedido de mudança de centro",
      body: `${subject} quer passar de ${centerRef(request.fromCenterId).name} para ${destination.name}.`,
      link: "/dashboard/mudancas-centro",
      exceptAccountId: input.accountId,
    });
    return this.toView(request, input.accountId);
  }

  private async catechumenRequest(
    accountId: string,
    catechumenId: string,
    toCenterId: string,
    reason: string,
    year: string,
    now: Date,
  ) {
    await this.access.applicant(accountId);
    const catechumen = await this.catechumens.findById(UniqueId.from(catechumenId));
    if (!catechumen || !catechumen.isAccessibleBy(accountId)) throw new CatechumenNotFoundError();
    const enrollment = await this.enrollments.findForCatechumen(catechumenId, year);
    if (!enrollment?.isConfirmed) {
      throw new InvalidCenterTransferError(
        "Só pode pedir mudança de centro com a matrícula deste ano já confirmada.",
      );
    }
    const open = await this.transfers.list({ status: "PENDING", catechumenId });
    if (open.length) throw new CenterTransferAlreadyOpenError();
    const klass = enrollment.classId ? await this.classes.findById(UniqueId.from(enrollment.classId)) : null;
    const fromCenterId = klass?.centerId ?? catechumen.centerId;
    return CenterTransferRequest.requestCatechumen({
      requestedBy: accountId,
      fromCenterId,
      toCenterId,
      reason,
      catechumenId,
      enrollmentId: enrollment.id.value,
      fromClassId: klass?.id.value,
      fromLevel: enrollment.level,
      now,
    });
  }

  private async catechistRequest(
    accountId: string,
    toCenterId: string,
    reason: string,
    year: string,
    now: Date,
  ) {
    await this.access.catechist(accountId);
    const open = await this.transfers.list({ status: "PENDING", catechistAccountId: accountId });
    if (open.length) throw new CenterTransferAlreadyOpenError();
    const [klass, profile, person] = await Promise.all([
      this.classes.findForCatechist(accountId, year),
      this.profiles.find(accountId),
      this.people.find(accountId),
    ]);
    const fromCenterId = klass?.centerId ?? profile?.centerId ?? person?.centerId;
    if (!fromCenterId) throw new InvalidCenterTransferError("Não foi possível identificar o centro atual.");
    return CenterTransferRequest.requestCatechist({
      requestedBy: accountId,
      fromCenterId,
      toCenterId,
      reason,
      fromClassId: klass?.id.value,
      fromLevel: klass?.level,
      now,
    });
  }

  private async toView(request: CenterTransferRequest, accountId: string): Promise<CenterTransferView> {
    return toTransferView(request, this.people, this.catechumens, this.classes, {
      canDecide: false,
      canCancel: request.isPending && request.requestedBy === accountId,
    });
  }
}

/** Os pedidos da própria conta (família ou catequista). */
export class ListMyCenterTransfersUseCase {
  constructor(
    private readonly transfers: CenterTransferRepository,
    private readonly people: PeopleDirectory,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
  ) {}

  async execute({ accountId }: { accountId: string }): Promise<CenterTransferView[]> {
    const items = await this.transfers.list({ requestedBy: accountId });
    return Promise.all(
      items.map((item) =>
        toTransferView(item, this.people, this.catechumens, this.classes, {
          canDecide: false,
          canCancel: item.isPending,
        }),
      ),
    );
  }
}

/** A família ou o catequista cancela o pedido enquanto está pendente. */
export class CancelCenterTransferUseCase {
  constructor(
    private readonly transfers: CenterTransferRepository,
    private readonly clock: Clock,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute({ accountId, id }: { accountId: string; id: string }): Promise<void> {
    const request = await this.transfers.findById(UniqueId.from(id));
    if (!request) throw new CenterTransferNotFoundError();
    request.cancel(accountId, this.clock.now());
    await this.transfers.save(request);
    await this.activity.record({
      actorId: accountId,
      category: "CATECHISTS",
      action: "catechesis.center_transfer_cancelled",
      summary: "Cancelou o pedido de mudança de centro",
    });
  }
}

/** Fila da coordenação: entradas no seu centro e saídas. */
export class ListCoordinationCenterTransfersUseCase {
  constructor(
    private readonly transfers: CenterTransferRepository,
    private readonly people: PeopleDirectory,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
  ) {}

  async execute({
    scope,
    status,
  }: {
    scope?: CenterScope;
    status?: CenterTransferStatus;
  }): Promise<CenterTransferView[]> {
    const items =
      !scope || scope.kind === "parish"
        ? await this.transfers.list({ status })
        : uniqueById([
            ...(await this.transfers.list({ status, toCenterId: scope.centerId })),
            ...(await this.transfers.list({ status, fromCenterId: scope.centerId })),
          ]);
    return Promise.all(
      items.map((item) =>
        toTransferView(item, this.people, this.catechumens, this.classes, {
          canDecide: item.isPending && canDecide(scope, item.toCenterId),
          canCancel: false,
        }),
      ),
    );
  }
}

/** Detalhe com as turmas possíveis (vagas ou sugestões). */
export class GetCenterTransferUseCase {
  constructor(
    private readonly transfers: CenterTransferRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly catechumens: CatechumenRepository,
  ) {}

  async execute({
    id,
    scope,
  }: {
    id: string;
    scope?: CenterScope;
  }): Promise<CenterTransferView> {
    const request = await this.transfers.findById(UniqueId.from(id));
    if (!request || !canSee(scope, request)) throw new CenterTransferNotFoundError();
    const view = await toTransferView(request, this.people, this.catechumens, this.classes, {
      canDecide: request.isPending && canDecide(scope, request.toCenterId),
      canCancel: false,
    });
    if (!request.isPending) return view;
    return { ...view, options: await this.options(request) };
  }

  private async options(request: CenterTransferRequest): Promise<TransferOptionsView> {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const yearClasses = await this.classes.listByYear(calendar.label);
    if (request.kind === "CATECHUMEN") {
      return {
        canAcceptWithoutClass: false,
        catechumen: await catechumenVacancies(request, yearClasses, this.enrollments),
      };
    }
    return {
      canAcceptWithoutClass: true,
      catechist: await catechistSuggestions(request, yearClasses, this.enrollments),
    };
  }
}

/** A coordenação de destino (ou a geral) aceita ou recusa. */
export class DecideCenterTransferUseCase {
  constructor(
    private readonly transfers: CenterTransferRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly profiles: CatechistProfileRepository,
    private readonly accounts: AccountRepository,
    private readonly people: PeopleDirectory,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  async execute(input: {
    actorId: string;
    id: string;
    scope?: CenterScope;
    decision: "APPROVED" | "REJECTED";
    classId?: string;
    role?: ClassCatechistRole;
    note?: string;
  }): Promise<CenterTransferView> {
    const request = await this.transfers.findById(UniqueId.from(input.id));
    if (!request || !canSee(input.scope, request)) throw new CenterTransferNotFoundError();
    if (!canDecide(input.scope, request.toCenterId)) throw new CenterForbiddenError();
    const now = this.clock.now();
    if (input.decision === "REJECTED") {
      request.reject(input.actorId, now, input.note);
    } else if (request.kind === "CATECHUMEN") {
      await this.approveCatechumen(request, input.actorId, now, input.classId, input.note);
    } else {
      await this.approveCatechist(request, input.actorId, now, input.classId, input.role, input.note);
    }
    await this.transfers.save(request);
    const subject = await subjectName(request, this.people, this.catechumens);
    await this.activity.record({
      actorId: input.actorId,
      category: "CATECHISTS",
      action:
        input.decision === "APPROVED"
          ? "catechesis.center_transfer_approved"
          : "catechesis.center_transfer_rejected",
      summary:
        input.decision === "APPROVED"
          ? `Aceitou a mudança de centro de ${subject}`
          : `Recusou a mudança de centro de ${subject}`,
    });
    await this.notifier.notify({
      to: { accountIds: [request.requestedBy] },
      kind:
        input.decision === "APPROVED"
          ? "catechesis.center_transfer_approved"
          : "catechesis.center_transfer_rejected",
      title:
        input.decision === "APPROVED" ? "Mudança de centro aceite" : "Mudança de centro recusada",
      body:
        input.decision === "APPROVED"
          ? `Já frequenta ${centerRef(request.toCenterId).name}.`
          : input.note?.trim() || `${subject} continua em ${centerRef(request.fromCenterId).name}.`,
      link: "/portal",
      exceptAccountId: input.actorId,
    });
    return toTransferView(request, this.people, this.catechumens, this.classes, {
      canDecide: false,
      canCancel: false,
    });
  }

  private async approveCatechumen(
    request: CenterTransferRequest,
    actorId: string,
    now: Date,
    classId: string | undefined,
    note?: string,
  ) {
    if (!classId) throw new InvalidCenterTransferError("Escolha a turma de destino com vaga.");
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const dest = await this.classes.findById(UniqueId.from(classId));
    if (!dest) throw new ClassNotFoundError();
    const enrollment = request.enrollmentId
      ? await this.enrollments.findById(UniqueId.from(request.enrollmentId))
      : null;
    if (!enrollment?.isConfirmed) {
      throw new InvalidCenterTransferError("A matrícula deste ano já não está confirmada.");
    }
    const origin = request.fromClassId
      ? await this.classes.findById(UniqueId.from(request.fromClassId))
      : null;
    if (
      dest.centerId !== request.toCenterId ||
      dest.catecheticalYear !== calendar.label ||
      dest.level !== enrollment.level ||
      !compatibleClass(origin ?? undefined, dest)
    ) {
      throw new InvalidCenterTransferError(
        "A turma tem de ser do mesmo ano, do mesmo nível e do centro de destino.",
      );
    }
    const enrolled = await this.enrollments.countConfirmedInClass(dest.id.value);
    if (enrolled >= dest.capacity) throw new NoCenterVacancyError();
    enrollment.changeClass(
      dest.id.value,
      actorId,
      now,
      `Mudança de centro: ${centerRef(request.fromCenterId).name} → ${centerRef(request.toCenterId).name}`,
    );
    await this.enrollments.save(enrollment);
    const catechumen = request.catechumenId
      ? await this.catechumens.findById(UniqueId.from(request.catechumenId))
      : null;
    if (catechumen) {
      catechumen.placeAt(request.toCenterId, now);
      await this.catechumens.save(catechumen);
      if (catechumen.accountId) {
        await this.moveAccount(catechumen.accountId, request.toCenterId, now);
      }
    }
    request.approve(actorId, now, { toClassId: dest.id.value, note });
  }

  private async approveCatechist(
    request: CenterTransferRequest,
    actorId: string,
    now: Date,
    classId: string | undefined,
    role: ClassCatechistRole | undefined,
    note?: string,
  ) {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const accountId = request.catechistAccountId ?? request.requestedBy;
    const current = await this.classes.findForCatechist(accountId, calendar.label);
    if (current) {
      current.assignCatechists(current.catechists.filter((item) => item.accountId !== accountId));
      await this.classes.save(current);
    }
    if (classId) {
      const dest = await this.classes.findById(UniqueId.from(classId));
      if (!dest) throw new ClassNotFoundError();
      if (dest.centerId !== request.toCenterId || dest.catecheticalYear !== calendar.label) {
        throw new InvalidCenterTransferError("A turma tem de ser do centro de destino e deste ano.");
      }
      const chosen = role ?? (dest.lead ? ClassCatechistRole.ASSISTANT : ClassCatechistRole.LEAD);
      if (chosen === ClassCatechistRole.LEAD && dest.lead) {
        throw new InvalidCenterTransferError("Esta turma já tem catequista principal.");
      }
      if (dest.catechists.length >= MAX_CATECHISTS) {
        throw new InvalidCenterTransferError("Esta turma já tem o máximo de catequistas.");
      }
      dest.assignCatechists([...dest.catechists, { accountId, role: chosen }]);
      await this.classes.save(dest);
      request.approve(actorId, now, { toClassId: dest.id.value, catechistRole: chosen, note });
    } else {
      request.approve(actorId, now, { note });
    }
    const profile = await this.profiles.find(accountId);
    await this.profiles.save({
      accountId,
      status: profile?.status,
      centerId: request.toCenterId,
      updatedAt: now,
      updatedBy: actorId,
    });
    await this.moveAccount(accountId, request.toCenterId, now);
  }

  private async moveAccount(accountId: string, centerId: string, now: Date) {
    const account = await this.accounts.findById(UniqueId.from(accountId));
    if (!account) return;
    account.setHomeCenter(centerId, now);
    await this.accounts.save(account);
  }
}

export async function originStayOf(
  request: CenterTransferRequest,
  classes: ClassRepository,
  attendance: AttendanceRepository,
  catechumenId?: string,
): Promise<OriginStayView> {
  const klass = request.fromClassId
    ? await classes.findById(UniqueId.from(request.fromClassId))
    : null;
  const entries =
    klass && catechumenId
      ? await attendance.listForCatechumen(klass.id.value, catechumenId)
      : [];
  return {
    fromCenter: centerRef(request.fromCenterId),
    fromClass: klass
      ? {
          id: klass.id.value,
          section: klass.section,
          slot: klass.slot,
          startTime: klass.startTime,
        }
      : undefined,
    attendanceRate: attendanceTotals(entries).rate,
    reason: request.reason,
    decidedAt: request.decidedAt?.toISOString() ?? request.updatedAt.toISOString(),
  };
}

async function catechumenVacancies(
  request: CenterTransferRequest,
  yearClasses: CatechesisClass[],
  enrollments: EnrollmentRepository,
): Promise<CatechumenVacancyView[]> {
  const origin = request.fromClassId
    ? yearClasses.find((item) => item.id.value === request.fromClassId)
    : undefined;
  const candidates = yearClasses.filter(
    (item) =>
      item.centerId === request.toCenterId &&
      item.level === request.fromLevel &&
      compatibleClass(origin, item),
  );
  const rows = await Promise.all(
    candidates.map(async (klass) => {
      const enrolled = await enrollments.countConfirmedInClass(klass.id.value);
      return { klass, enrolled, vacant: klass.capacity - enrolled };
    }),
  );
  return rows
    .filter((item) => item.vacant > 0)
    .sort((a, b) => b.vacant - a.vacant || a.klass.section.localeCompare(b.klass.section))
    .map(({ klass, enrolled, vacant }) => ({
      classId: klass.id.value,
      label: classLabel(klass),
      section: klass.section,
      slot: klass.slot,
      startTime: klass.startTime,
      room: klass.room,
      enrolled,
      capacity: klass.capacity,
      vacant,
    }));
}

async function catechistSuggestions(
  request: CenterTransferRequest,
  yearClasses: CatechesisClass[],
  enrollments: EnrollmentRepository,
): Promise<CatechistSuggestionView[]> {
  const rows = await Promise.all(
    yearClasses
      .filter((item) => item.centerId === request.toCenterId)
      .map(async (klass) => {
        const enrolled = await enrollments.countConfirmedInClass(klass.id.value);
        const canLead = !klass.lead;
        const canAssist = klass.catechists.length < MAX_CATECHISTS;
        const sameLevel = Boolean(request.fromLevel && klass.level === request.fromLevel);
        const roles: ClassCatechistRole[] = [
          ...(canLead ? [ClassCatechistRole.LEAD] : []),
          ...(canAssist ? [ClassCatechistRole.ASSISTANT] : []),
        ];
        const priority = !roles.length
          ? 99
          : sameLevel && canLead
            ? 1
            : sameLevel
              ? 2
              : canLead
                ? 3
                : 4;
        return { klass, enrolled, roles, sameLevel, priority };
      }),
  );
  return rows
    .filter((item) => item.roles.length)
    .sort((a, b) => a.priority - b.priority || a.klass.section.localeCompare(b.klass.section))
    .map(({ klass, enrolled, roles, sameLevel, priority }) => ({
      classId: klass.id.value,
      label: classLabel(klass),
      section: klass.section,
      level: klass.level,
      sameLevel,
      slot: klass.slot,
      startTime: klass.startTime,
      room: klass.room,
      enrolled,
      capacity: klass.capacity,
      roles,
      priority,
    }));
}

async function toTransferView(
  request: CenterTransferRequest,
  people: PeopleDirectory,
  catechumens: CatechumenRepository,
  classes: ClassRepository,
  flags: { canDecide: boolean; canCancel: boolean },
): Promise<CenterTransferView> {
  const ids = [request.requestedBy, request.decidedBy].filter((id): id is string => Boolean(id));
  const names = new Map((await people.findMany(ids)).map((person) => [person.id, person.fullName]));
  const [fromClass, toClass] = await Promise.all([
    request.fromClassId ? classes.findById(UniqueId.from(request.fromClassId)) : null,
    request.toClassId ? classes.findById(UniqueId.from(request.toClassId)) : null,
  ]);
  return {
    id: request.id.value,
    kind: request.kind,
    status: request.status,
    requestedBy: {
      id: request.requestedBy,
      fullName: names.get(request.requestedBy) ?? "—",
    },
    subjectName: await subjectName(request, people, catechumens),
    fromCenter: centerRef(request.fromCenterId),
    toCenter: centerRef(request.toCenterId),
    reason: request.reason,
    catechumenId: request.catechumenId,
    enrollmentId: request.enrollmentId,
    fromClass: fromClass ? { id: fromClass.id.value, label: classLabel(fromClass) } : undefined,
    fromLevel: request.fromLevel,
    toClass: toClass ? { id: toClass.id.value, label: classLabel(toClass) } : undefined,
    catechistRole: request.catechistRole,
    requestedAt: request.requestedAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString(),
    decidedBy: request.decidedBy
      ? { id: request.decidedBy, fullName: names.get(request.decidedBy) ?? "—" }
      : undefined,
    decisionNote: request.decisionNote,
    canDecide: flags.canDecide,
    canCancel: flags.canCancel,
  };
}

async function subjectName(
  request: CenterTransferRequest,
  people: PeopleDirectory,
  catechumens: CatechumenRepository,
) {
  if (request.catechumenId) {
    const catechumen = await catechumens.findById(UniqueId.from(request.catechumenId));
    if (catechumen) return catechumen.fullName;
  }
  if (request.catechistAccountId) {
    return (await people.find(request.catechistAccountId))?.fullName ?? "Catequista";
  }
  return (await people.find(request.requestedBy))?.fullName ?? "—";
}

function uniqueById(items: CenterTransferRequest[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id.value)) return false;
    seen.add(item.id.value);
    return true;
  });
}
