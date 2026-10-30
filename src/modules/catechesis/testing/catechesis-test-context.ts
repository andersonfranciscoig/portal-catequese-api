import { UploadPolicy } from "../../../shared/application/file-storage.js";
import { MemoryFileStorage } from "../../../shared/infrastructure/storage/memory-file-storage.js";
import { RecordingEventBus } from "../../../shared/testing/recording-event-bus.js";
import { RecordingNotifier } from "../../../shared/testing/recording-notifier.js";
import {
  PeopleDirectory,
  type PersonSnapshot,
} from "../../../shared/application/people-directory.js";
import { FixedClock } from "../../../shared/testing/fixed-clock.js";
import { RecordingActivity } from "../../../shared/testing/recording-activity.js";
import { CatechesisAccess } from "../application/catechesis-access.js";
import { CatechistClassResolver } from "../application/catechist-class.js";
import { EnrollmentCodes } from "../application/enrollment-codes.js";
import {
  GetClassCatechumenUseCase,
  GetEvaluationsUseCase,
  SaveEvaluationsUseCase,
} from "../application/use-cases/catechist/evaluation.use-cases.js";
import { GetMyClassUseCase } from "../application/use-cases/catechist/get-my-class.use-case.js";
import {
  GetRollUseCase,
  SaveRollUseCase,
} from "../application/use-cases/catechist/roll.use-cases.js";
import {
  DeleteCalendarActivityUseCase,
  ListCalendarActivitiesUseCase,
  ListPortalCalendarUseCase,
  SaveCalendarActivityUseCase,
} from "../application/use-cases/coordination/calendar-activities.use-cases.js";
import {
  DeleteAnnouncementUseCase,
  ListAnnouncementsUseCase,
  ListMyAnnouncementsUseCase,
  PublishAnnouncementUseCase,
  SetAnnouncementPinnedUseCase,
} from "../application/use-cases/coordination/announcements.use-cases.js";
import {
  GetCalendarUseCase,
  SetCalendarUseCase,
  SetDeadlineUseCase,
} from "../application/use-cases/coordination/calendar.use-cases.js";
import {
  AssignCatechistsUseCase,
  CreateClassUseCase,
  ListClassesUseCase,
} from "../application/use-cases/coordination/class.use-cases.js";
import {
  GetSessionUseCase,
  ListSessionDaysUseCase,
  SetCatechistPresenceUseCase,
} from "../application/use-cases/coordination/attendance.use-cases.js";
import {
  CatechistDirectory,
  GetCatechistProfileUseCase,
  ListCatechistsUseCase,
  SetCatechistStatusUseCase,
} from "../application/use-cases/coordination/catechists.use-cases.js";
import {
  GetCatechumenFileUseCase,
  ListCatechumensUseCase,
} from "../application/use-cases/coordination/catechumens.use-cases.js";
import {
  GetClassDetailUseCase,
  GetClassResultsUseCase,
  ListYearsUseCase,
} from "../application/use-cases/coordination/class-detail.use-cases.js";
import {
  ClassGeneration,
  GenerateClassesUseCase,
  PlanClassesUseCase,
} from "../application/use-cases/coordination/class-generation.use-cases.js";
import { GetOverviewUseCase } from "../application/use-cases/coordination/overview.use-case.js";
import { TrackEnrollmentUseCase } from "../application/use-cases/public/track-enrollment.use-case.js";
import {
  EnrollmentActionUseCase,
  GetEnrollmentDetailUseCase,
  ListEnrollmentsUseCase,
} from "../application/use-cases/coordination/enrollment.use-cases.js";
import {
  ListEnrollmentDocumentsUseCase,
  ReadEnrollmentDocumentUseCase,
  UploadEnrollmentDocumentUseCase,
} from "../application/use-cases/documents/enrollment-documents.use-cases.js";
import {
  ConfirmationCandidates,
  ConfirmEnrollmentUseCase,
  ListMyConfirmationsUseCase,
  SearchConfirmationsUseCase,
} from "../application/use-cases/family/confirmations.use-cases.js";
import { GetCatechumenProfileUseCase } from "../application/use-cases/family/get-catechumen-profile.use-case.js";
import { GetFamilyUseCase } from "../application/use-cases/family/get-family.use-case.js";
import {
  SubmitEnrollmentUseCase,
  type SubmitEnrollmentInput,
} from "../application/use-cases/family/submit-enrollment.use-case.js";
import {
  InMemoryAnnouncementRepository,
  InMemoryCalendarActivityRepository,
  InMemoryAttendanceRepository,
  InMemoryCalendarRepository,
  InMemoryCatechistPresenceRepository,
  InMemoryCatechistProfileRepository,
  InMemoryCatechumenRepository,
  InMemoryClassRepository,
  InMemoryEnrollmentDocumentRepository,
  InMemoryEnrollmentRepository,
  InMemoryEvaluationRepository,
  InMemoryRollReminderRepository,
  InMemorySacramentRecordRepository,
  InMemorySacramentRepository,
} from "../infrastructure/persistence/in-memory/in-memory-catechesis.repositories.js";
import { SacramentRecords } from "../application/sacrament-records.js";
import {
  CompleteCelebrationUseCase,
  ListSacramentRecordsUseCase,
  SacramentRecordsSummaryUseCase,
  SetReceivedSacramentUseCase,
} from "../application/use-cases/coordination/sacrament-records.use-cases.js";
import { RecordingMailer } from "../../../shared/testing/recording-mailer.js";
import {
  PaymentsLedger,
  type PaymentSnapshot,
} from "../../../shared/application/payments-ledger.js";
import {
  ExportReportUseCase,
  GetReportUseCase,
} from "../application/use-cases/coordination/reports.use-cases.js";
import {
  CreateCelebrationUseCase,
  DeleteCelebrationUseCase,
  GetSacramentsOverviewUseCase,
  ListCelebrationParticipantsUseCase,
  ListClassMembersForSacramentUseCase,
  ListSacramentCandidatesUseCase,
  ListSelectableClassesUseCase,
  SacramentCandidates,
  SacramentCelebrations,
  SetSacramentRequirementUseCase,
  UpdateCelebrationUseCase,
} from "../application/use-cases/coordination/sacraments.use-cases.js";
import {
  ListMyPendingRollsUseCase,
  ListPendingRollsUseCase,
  PendingRolls,
  SendRollRemindersUseCase,
} from "../application/use-cases/coordination/roll-reminders.use-cases.js";
import { RecordingMessenger } from "../../../shared/testing/recording-messenger.js";

/** Pagamentos falsos (o módulo dos pagamentos não entra nos testes da catequese). */
export class FakePaymentsLedger extends PaymentsLedger {
  readonly items: PaymentSnapshot[] = [];
  async listForEnrollments(enrollmentIds: string[]) {
    return this.items.filter((item) => enrollmentIds.includes(item.enrollmentId));
  }
}

/** Diretório de pessoas falso: as contas que cada teste precisar. */
export class FakePeopleDirectory extends PeopleDirectory {
  readonly people = new Map<string, PersonSnapshot>();

  add(person: Partial<PersonSnapshot> & Pick<PersonSnapshot, "id" | "fullName">) {
    const roles = person.roles ?? ["GUARDIAN"];
    this.people.set(person.id, {
      phone: "+244923000000",
      roles,
      approvedCatechist: false,
      active: true,
      createdAt: "2025-09-01T00:00:00.000Z",
      catechistApproval: roles.includes("CATECHIST")
        ? person.approvedCatechist
          ? "APPROVED"
          : "PENDING"
        : undefined,
      ...person,
    });
  }

  async listCatechists() {
    return [...this.people.values()].filter((person) => person.roles.includes("CATECHIST"));
  }

  async listByRoles(roles: PersonSnapshot["roles"][number][]) {
    return [...this.people.values()].filter(
      (person) => person.active && person.roles.some((role) => roles.includes(role)),
    );
  }

  async find(id: string) {
    return this.people.get(id) ?? null;
  }

  async findMany(ids: string[]) {
    return [...new Set(ids)].flatMap((id) => this.people.get(id) ?? []);
  }

  /** Nos testes, a coordenação é a conta `IDS.coordinator`. */
  async idsWithPermission() {
    return [IDS.coordinator];
  }
}

export const IDS = {
  coordinator: "00000000-0000-4000-8000-000000000001",
  guardian: "00000000-0000-4000-8000-000000000002",
  adult: "00000000-0000-4000-8000-000000000003",
  catechist: "00000000-0000-4000-8000-000000000004",
  /** Catequista que também é encarregada. */
  both: "00000000-0000-4000-8000-000000000005",
  pending: "00000000-0000-4000-8000-000000000006",
  stranger: "00000000-0000-4000-8000-000000000007",
};

export function createCatechesisTestContext() {
  const calendars = new InMemoryCalendarRepository();
  const catechumens = new InMemoryCatechumenRepository();
  const enrollments = new InMemoryEnrollmentRepository();
  const classes = new InMemoryClassRepository();
  const attendance = new InMemoryAttendanceRepository();
  const evaluations = new InMemoryEvaluationRepository();
  const people = new FakePeopleDirectory();
  const activity = new RecordingActivity();
  const notifier = new RecordingNotifier();
  const events = new RecordingEventBus();
  const documents = new InMemoryEnrollmentDocumentRepository();
  const storage = new MemoryFileStorage();
  const policy = new UploadPolicy(1024 * 1024);
  const profiles = new InMemoryCatechistProfileRepository();
  const presence = new InMemoryCatechistPresenceRepository();
  const sacramentRepository = new InMemorySacramentRepository();
  const announcements = new InMemoryAnnouncementRepository();
  const activities = new InMemoryCalendarActivityRepository();
  const ledger = new FakePaymentsLedger();
  const mailer = new RecordingMailer();
  const messenger = new RecordingMessenger();
  const reminders = new InMemoryRollReminderRepository();
  const recordRepository = new InMemorySacramentRecordRepository();
  // Terça-feira, 13 de outubro de 2026.
  const clock = new FixedClock();
  const sacramentRecords = new SacramentRecords(recordRepository, clock);
  let next = 0;
  const codes = new EnrollmentCodes(enrollments, () => 48_200 + next++);
  const access = new CatechesisAccess(people);
  const candidates = new ConfirmationCandidates(
    catechumens,
    enrollments,
    classes,
    evaluations,
    attendance,
    calendars,
    people,
    clock,
  );
  const resolver = new CatechistClassResolver(
    access,
    calendars,
    classes,
    enrollments,
    catechumens,
    clock,
  );

  people.add({ id: IDS.coordinator, fullName: "Teresa Domingos" });
  people.add({ id: IDS.guardian, fullName: "Anderson Francisco", phone: "+244923482117" });
  people.add({ id: IDS.adult, fullName: "Carlos Mendes", roles: ["CATECHUMEN"] });
  people.add({
    id: IDS.catechist,
    fullName: "Maria José",
    roles: ["CATECHIST"],
    approvedCatechist: true,
  });
  people.add({
    id: IDS.both,
    fullName: "Joana Kiala",
    roles: ["GUARDIAN", "CATECHIST"],
    approvedCatechist: true,
  });
  people.add({ id: IDS.pending, fullName: "Lucas Pedro", roles: ["CATECHIST"] });
  people.add({ id: IDS.stranger, fullName: "Rosa Afonso" });

  const ctx = {
    mailer,
    messenger,
    reminders,
    recordRepository,
    presence,
    ledger,
    sacramentRepository,
    events,
    documents,
    storage,
    calendars,
    catechumens,
    enrollments,
    classes,
    attendance,
    evaluations,
    people,
    activity,
    notifier,
    clock,
    getCalendar: new GetCalendarUseCase(calendars),
    setCalendar: new SetCalendarUseCase(calendars, activity, clock),
    family: new GetFamilyUseCase(catechumens, enrollments, classes, calendars, people, clock),
    profile: new GetCatechumenProfileUseCase(
      catechumens,
      enrollments,
      classes,
      attendance,
      calendars,
      people,
      clock,
      recordRepository,
    ),
    submit: new SubmitEnrollmentUseCase(
      catechumens,
      enrollments,
      calendars,
      access,
      codes,
      activity,
      clock,
      notifier,
      events,
      sacramentRecords,
    ),
    myClass: new GetMyClassUseCase(resolver, attendance, people),
    roll: new GetRollUseCase(resolver, attendance),
    saveRoll: new SaveRollUseCase(resolver, attendance, activity, clock, notifier),
    getEvaluations: new GetEvaluationsUseCase(resolver, attendance, evaluations),
    saveEvaluations: new SaveEvaluationsUseCase(resolver, attendance, evaluations, activity, clock),
    file: new GetClassCatechumenUseCase(resolver, attendance, evaluations, people),
    listClasses: new ListClassesUseCase(classes, enrollments, calendars, people, clock),
    createClass: new CreateClassUseCase(classes, calendars, people, activity, clock),
    assign: new AssignCatechistsUseCase(
      classes,
      enrollments,
      calendars,
      people,
      activity,
      clock,
      notifier,
    ),
    listEnrollments: new ListEnrollmentsUseCase(
      enrollments,
      catechumens,
      classes,
      calendars,
      people,
    ),
    detail: new GetEnrollmentDetailUseCase(enrollments, catechumens, classes, documents, people),
    act: new EnrollmentActionUseCase(enrollments, classes, catechumens, activity, clock, notifier),
    upload: new UploadEnrollmentDocumentUseCase(
      enrollments,
      catechumens,
      documents,
      storage,
      policy,
      activity,
      notifier,
      clock,
    ),
    listDocuments: new ListEnrollmentDocumentsUseCase(enrollments, catechumens, documents),
    readDocument: new ReadEnrollmentDocumentUseCase(enrollments, catechumens, documents, storage),
    confirmations: new ListMyConfirmationsUseCase(catechumens, candidates),
    searchConfirmations: new SearchConfirmationsUseCase(
      enrollments,
      catechumens,
      calendars,
      candidates,
    ),
    confirm: new ConfirmEnrollmentUseCase(
      catechumens,
      enrollments,
      candidates,
      access,
      codes,
      calendars,
      events,
      activity,
      notifier,
      clock,
    ),

    setDeadline: new SetDeadlineUseCase(calendars, activity, clock),
    years: new ListYearsUseCase(classes, calendars),
    classDetail: new GetClassDetailUseCase(
      classes,
      enrollments,
      catechumens,
      attendance,
      calendars,
      people,
      clock,
    ),
    results: new GetClassResultsUseCase(classes, enrollments, catechumens, attendance, evaluations),
    overview: new GetOverviewUseCase(enrollments, catechumens, classes, calendars, people, clock),
    track: new TrackEnrollmentUseCase(enrollments, catechumens, classes, people),
    sessionDays: new ListSessionDaysUseCase(calendars, clock),
    session: new GetSessionUseCase(
      classes,
      enrollments,
      attendance,
      presence,
      calendars,
      people,
      clock,
    ),
    setPresence: new SetCatechistPresenceUseCase(
      classes,
      presence,
      calendars,
      activity,
      clock,
      notifier,
      messenger,
    ),
    listCatechumens: new ListCatechumensUseCase(
      enrollments,
      catechumens,
      classes,
      calendars,
      people,
    ),
    catechumenFile: new GetCatechumenFileUseCase(
      catechumens,
      enrollments,
      classes,
      attendance,
      evaluations,
      calendars,
      people,
      recordRepository,
    ),
    setReceivedSacrament: new SetReceivedSacramentUseCase(catechumens, sacramentRecords, activity),
    setCatechistStatus: new SetCatechistStatusUseCase(people, profiles, activity, clock),
    get catechists() {
      const directory = new CatechistDirectory(
        people,
        classes,
        enrollments,
        profiles,
        presence,
        calendars,
      );
      return {
        list: new ListCatechistsUseCase(directory),
        profile: new GetCatechistProfileUseCase(directory),
      };
    },
    get sacraments() {
      const candidates = new SacramentCandidates(
        calendars,
        enrollments,
        catechumens,
        classes,
        attendance,
        evaluations,
        documents,
        sacramentRepository,
        people,
        recordRepository,
      );
      const celebrations = new SacramentCelebrations(candidates, sacramentRepository);
      return {
        overview: new GetSacramentsOverviewUseCase(celebrations),
        candidates: new ListSacramentCandidatesUseCase(candidates),
        setRequirement: new SetSacramentRequirementUseCase(
          candidates,
          sacramentRepository,
          catechumens,
          activity,
          clock,
        ),
        create: new CreateCelebrationUseCase(celebrations, sacramentRepository, activity, clock),
        update: new UpdateCelebrationUseCase(celebrations, sacramentRepository, activity, clock),
        remove: new DeleteCelebrationUseCase(celebrations, sacramentRepository, activity),
        participants: new ListCelebrationParticipantsUseCase(celebrations),
        classes: new ListSelectableClassesUseCase(celebrations),
        members: new ListClassMembersForSacramentUseCase(celebrations),
        complete: new CompleteCelebrationUseCase(
          celebrations,
          sacramentRepository,
          recordRepository,
          sacramentRecords,
          catechumens,
          activity,
          clock,
        ),
        records: new ListSacramentRecordsUseCase(
          recordRepository,
          catechumens,
          enrollments,
          classes,
          sacramentRepository,
          people,
        ),
        summary: new SacramentRecordsSummaryUseCase(recordRepository),
      };
    },
    get rolls() {
      const pending = new PendingRolls(attendance, reminders, people);
      return {
        pending: new ListPendingRollsUseCase(calendars, classes, pending, clock),
        mine: new ListMyPendingRollsUseCase(access, calendars, classes, pending, clock),
        remind: new SendRollRemindersUseCase(
          calendars,
          classes,
          pending,
          reminders,
          people,
          notifier,
          mailer,
          messenger,
          clock,
        ),
      };
    },
    get calendarActivities() {
      return {
        list: new ListCalendarActivitiesUseCase(activities),
        save: new SaveCalendarActivityUseCase(activities, activity, clock),
        remove: new DeleteCalendarActivityUseCase(activities, activity),
        portal: new ListPortalCalendarUseCase(calendars, sacramentRepository, activities, clock),
      };
    },
    get announcements() {
      return {
        list: new ListAnnouncementsUseCase(announcements, people),
        publish: new PublishAnnouncementUseCase(
          announcements,
          people,
          activity,
          notifier,
          mailer,
          clock,
        ),
        pin: new SetAnnouncementPinnedUseCase(announcements, people, activity, clock),
        remove: new DeleteAnnouncementUseCase(announcements, activity),
        mine: new ListMyAnnouncementsUseCase(announcements, clock),
      };
    },
    get reports() {
      return {
        report: new GetReportUseCase(
          calendars,
          enrollments,
          classes,
          attendance,
          evaluations,
          ledger,
          clock,
        ),
        export: new ExportReportUseCase(
          calendars,
          enrollments,
          ctx.listCatechumens,
          ctx.listClasses,
          ctx.sessionDays,
          ctx.session,
          ledger,
        ),
      };
    },
    get generation() {
      const generation = new ClassGeneration(classes, enrollments, calendars, profiles, people);
      return {
        plan: new PlanClassesUseCase(generation),
        generate: new GenerateClassesUseCase(
          generation,
          classes,
          enrollments,
          ctx.act,
          activity,
          clock,
        ),
      };
    },

    /** Atalho dos testes: confirmar numa turma ou recusar. */
    decide(
      input: { actorId: string; enrollmentId: string } & (
        { decision: "CONFIRMED"; classId: string } | { decision: "REJECTED" }
      ),
    ) {
      return ctx.act.execute({
        actorId: input.actorId,
        enrollmentId: input.enrollmentId,
        action:
          input.decision === "CONFIRMED"
            ? { kind: "confirm", classId: input.classId }
            : { kind: "reject" },
      });
    },

    /** O ano 2026/2027 (catequese de 26 de setembro a 3 de julho). */
    async defineYear() {
      return ctx.setCalendar.execute({
        actorId: IDS.coordinator,
        label: "2026/2027",
        startsOn: "2026-09-26",
        endsOn: "2027-07-03",
      });
    },

    /** Matrícula de um educando (Comunhão 1.º ano, sábado de manhã). */
    async enrollChild(
      overrides: Partial<SubmitEnrollmentInput["catechumen"]> = {},
      accountId = IDS.guardian,
    ) {
      return ctx.submit.execute({
        accountId,
        guardian: { relationship: "FATHER" },
        catechumen: {
          fullName: "Inês Francisco",
          birthDate: "2017-05-02",
          gender: "FEMALE",
          address: "Rua da Missão, Maianga",
          sacraments: { baptism: true, firstCommunion: false },
          ...overrides,
        },
        catechesis: { type: "NEW", level: "COMMUNION_1", preferredSlot: "SATURDAY_MORNING" },
      });
    },

    /** Turma A de Comunhão 1.º ano com a catequista principal. */
    async classWithCatechist(catechistId = IDS.catechist, capacity = 30) {
      const klass = await ctx.createClass.execute({
        actorId: IDS.coordinator,
        level: "COMMUNION_1",
        section: "A",
        slot: "SATURDAY_MORNING",
        startTime: "08:00",
        room: "Sala 04",
        capacity,
      });
      await ctx.assign.execute({
        actorId: IDS.coordinator,
        classId: klass.id,
        catechists: [{ accountId: catechistId, role: "LEAD" }],
      });
      return klass;
    },
  };
  return ctx;
}
