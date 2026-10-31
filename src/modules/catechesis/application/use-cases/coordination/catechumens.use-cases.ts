import type { PeopleDirectory } from "../../../../../shared/application/people-directory.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import {
  stageOf,
  type CatechesisLevel,
  type CatechesisStage,
  type EnrollmentStatus,
  type EnrollmentType,
  type Gender,
  type GuardianRelationship,
  type SessionSlot,
  type YearOutcome,
} from "../../../domain/catechesis.js";
import { centerRef } from "../../../domain/center.js";
import { matchesCenter, type CenterScope } from "../../center-scope.js";
import { attendanceTotals } from "../../../domain/class-attendance.js";
import {
  CalendarNotDefinedError,
  CatechumenNotFoundError,
  CenterForbiddenError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  AttendanceRepository,
  CalendarRepository,
  CatechumenRepository,
  CenterTransferRepository,
  ClassRepository,
  EnrollmentRepository,
  EvaluationRepository,
  SacramentRecordRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { toReceivedViews, type ReceivedSacramentView } from "../../sacrament-records.js";
import { originStayOf, type OriginStayView } from "../center-transfers.use-cases.js";

export interface CatechumenRowView {
  id: string;
  fullName: string;
  birthDate: string;
  level: CatechesisLevel;
  stage: CatechesisStage;
  status: EnrollmentStatus;
  enrollmentId: string;
  enrollmentCode: string;
  classLabel?: string;
  guardianName?: string;
  center: { id: string; name: string };
  fromCenter?: { id: string; name: string };
}

export interface CatechumenListQuery {
  search?: string;
  stage?: CatechesisStage;
  /** Por omissão, todos os estados menos recusada. */
  status?: EnrollmentStatus;
  page: number;
  pageSize: number;
  centerId?: string;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Catequizandos com matrícula no ano em curso. */
export class ListCatechumensUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly classes: ClassRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly transfers: CenterTransferRepository,
  ) {}

  async execute(query: CatechumenListQuery) {
    const calendar = await this.calendars.get();
    if (!calendar) throw new CalendarNotDefinedError();
    const yearEnrollments = (await this.enrollments.list({ catecheticalYear: calendar.label })).filter(
      (item) => (query.status ? item.status === query.status : item.status !== "REJECTED"),
    );
    const [catechumens, classes, arrivals] = await Promise.all([
      this.catechumens.findByIds(yearEnrollments.map((item) => item.catechumenId)),
      this.classes.listByYear(calendar.label),
      this.transfers.list({ status: "APPROVED" }),
    ]);
    const arrived = new Map<string, (typeof arrivals)[number]>();
    for (const item of arrivals) {
      if (item.kind === "CATECHUMEN" && item.catechumenId && !arrived.has(item.catechumenId)) {
        arrived.set(item.catechumenId, item);
      }
    }
    const byId = new Map(catechumens.map((item) => [item.id.value, item]));
    const enrollments = yearEnrollments.filter((enrollment) => {
      const catechumen = byId.get(enrollment.catechumenId);
      const klass = enrollment.classId
        ? classes.find((item) => item.id.value === enrollment.classId)
        : undefined;
      return (
        matchesCenter(enrollment.centerId, query.centerId) ||
        (klass ? matchesCenter(klass.centerId, query.centerId) : false) ||
        (catechumen ? matchesCenter(catechumen.centerId, query.centerId) : false)
      );
    });
    const guardians = new Map(
      (
        await this.people.findMany(
          catechumens.flatMap((item) => (item.guardianAccountId ? [item.guardianAccountId] : [])),
        )
      ).map((person) => [person.id, person.fullName]),
    );
    const search = normalize(query.search?.trim() ?? "");
    const rows: CatechumenRowView[] = enrollments
      .flatMap((enrollment) => {
        const catechumen = byId.get(enrollment.catechumenId);
        if (!catechumen) return [];
        const klass = enrollment.classId
          ? classes.find((item) => item.id.value === enrollment.classId)
          : undefined;
        return [
          {
            id: catechumen.id.value,
            fullName: catechumen.fullName,
            birthDate: catechumen.birthDate,
            level: enrollment.level,
            stage: stageOf(enrollment.level),
            status: enrollment.status,
            enrollmentId: enrollment.id.value,
            enrollmentCode: enrollment.code,
            classLabel: enrollment.isConfirmed && klass ? `Turma ${klass.section}` : undefined,
            guardianName: catechumen.guardianAccountId
              ? guardians.get(catechumen.guardianAccountId)
              : undefined,
            center: centerRef(klass?.centerId ?? catechumen.centerId),
            fromCenter: arrived.get(catechumen.id.value)
              ? centerRef(arrived.get(catechumen.id.value)!.fromCenterId)
              : undefined,
          },
        ];
      })
      .filter((row) => !query.stage || row.stage === query.stage)
      .filter(
        (row) =>
          !search ||
          normalize(`${row.fullName} ${row.enrollmentCode} ${row.guardianName ?? ""}`).includes(
            search,
          ),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
    const pageCount = Math.max(1, Math.ceil(rows.length / query.pageSize));
    const page = Math.min(Math.max(1, query.page), pageCount);
    return {
      items: rows.slice((page - 1) * query.pageSize, page * query.pageSize),
      total: rows.length,
      page,
      pageCount,
    };
  }
}

export interface JourneyYearView {
  catecheticalYear: string;
  enrollmentCode: string;
  submittedAt: string;
  level: CatechesisLevel;
  type: EnrollmentType;
  status: EnrollmentStatus;
  previousParish?: string;
  classId?: string;
  classSection?: string;
  catechistName?: string;
  slot?: SessionSlot;
  startTime?: string;
  attendanceRate?: number;
  outcome?: YearOutcome;
  isCurrent: boolean;
  originStay?: OriginStayView;
}

export interface CatechumenFileView {
  id: string;
  fullName: string;
  birthDate: string;
  gender: Gender;
  address?: string;
  baptized: boolean;
  firstCommunion: boolean;
  /** Os três sacramentos, sempre (recebidos ou não), com data e paróquia. */
  sacraments: ReceivedSacramentView[];
  guardian?: {
    fullName: string;
    phone: string;
    email?: string;
    relationship?: GuardianRelationship;
  };
  /** Adulto inscrito por si. */
  applicant?: { fullName: string; phone: string; email?: string };
  journey: JourneyYearView[];
}

/** Ficha do catequizando para a coordenação: contactos e percurso de todos os anos. */
export class GetCatechumenFileUseCase {
  constructor(
    private readonly catechumens: CatechumenRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly classes: ClassRepository,
    private readonly attendance: AttendanceRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly calendars: CalendarRepository,
    private readonly people: PeopleDirectory,
    private readonly records: SacramentRecordRepository,
    private readonly transfers: CenterTransferRepository,
  ) {}

  async execute({
    catechumenId,
    scope,
  }: {
    catechumenId: string;
    scope?: CenterScope;
  }): Promise<CatechumenFileView> {
    const catechumen = await this.catechumens.findById(UniqueId.from(catechumenId));
    if (!catechumen) throw new CatechumenNotFoundError();
    const [calendar, enrollments, moves] = await Promise.all([
      this.calendars.get(),
      this.enrollments.listForCatechumens([catechumenId]),
      this.transfers.list({ status: "APPROVED", catechumenId }),
    ]);
    const arrival = moves[0];
    const classes = await this.classes.findByIds([
      ...enrollments.flatMap((item) => (item.classId ? [item.classId] : [])),
      ...(arrival?.fromClassId ? [arrival.fromClassId] : []),
    ]);
    if (scope?.kind === "center") {
      const visible =
        catechumen.centerId === scope.centerId ||
        enrollments.some((item) => item.centerId === scope.centerId) ||
        classes.some((item) => item.centerId === scope.centerId) ||
        moves.some(
          (item) => item.fromCenterId === scope.centerId || item.toCenterId === scope.centerId,
        );
      if (!visible) throw new CenterForbiddenError();
    }
    const people = new Map(
      (
        await this.people.findMany(
          [
            catechumen.guardianAccountId,
            catechumen.accountId,
            ...classes.flatMap((klass) => (klass.lead ? [klass.lead.accountId] : [])),
          ].filter((id): id is string => Boolean(id)),
        )
      ).map((person) => [person.id, person]),
    );
    const journey = await Promise.all(
      enrollments
        .sort((a, b) => b.catecheticalYear.localeCompare(a.catecheticalYear))
        .map(async (enrollment) => {
          const klass = enrollment.isConfirmed
            ? classes.find((item) => item.id.value === enrollment.classId)
            : undefined;
          const [entries, evaluations] = klass
            ? await Promise.all([
                this.attendance.listForCatechumen(klass.id.value, catechumenId),
                this.evaluations.listForClass(klass.id.value),
              ])
            : [[], []];
          return {
            catecheticalYear: enrollment.catecheticalYear,
            enrollmentCode: enrollment.code,
            submittedAt: enrollment.submittedAt.toISOString(),
            level: enrollment.level,
            type: enrollment.type,
            status: enrollment.status,
            previousParish: enrollment.previousParish,
            classId: klass?.id.value,
            classSection: klass?.section,
            catechistName: klass?.lead ? people.get(klass.lead.accountId)?.fullName : undefined,
            slot: klass?.slot,
            startTime: klass?.startTime,
            attendanceRate: attendanceTotals(entries).rate,
            outcome: evaluations.find((item) => item.catechumenId === catechumenId)?.outcome,
            isCurrent: enrollment.catecheticalYear === calendar?.label,
            originStay:
              enrollment.catecheticalYear === calendar?.label && arrival
                ? await originStayOf(arrival, this.classes, this.attendance, catechumenId)
                : undefined,
          };
        }),
    );
    const guardian = catechumen.guardianAccountId
      ? people.get(catechumen.guardianAccountId)
      : undefined;
    const adult = catechumen.accountId ? people.get(catechumen.accountId) : undefined;
    return {
      id: catechumen.id.value,
      fullName: catechumen.fullName,
      birthDate: catechumen.birthDate,
      gender: catechumen.gender,
      address: catechumen.address,
      baptized: catechumen.baptized,
      firstCommunion: catechumen.firstCommunion,
      sacraments: toReceivedViews(await this.records.listForCatechumens([catechumenId])),
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
      journey,
    };
  }
}
