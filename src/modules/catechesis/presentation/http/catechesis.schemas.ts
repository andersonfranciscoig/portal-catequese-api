import { z } from "zod";

import {
  AttendanceStatus,
  CatechesisLevel,
  ClassCatechistRole,
  EnrollmentType,
  Gender,
  GuardianRelationship,
  SessionSlot,
  YearOutcome,
} from "../../domain/catechesis.js";
import { SacramentRequirement, SacramentType } from "../../domain/sacraments.js";
import { REPORT_EXPORTS } from "../../application/use-cases/coordination/reports.use-cases.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => value?.trim() || undefined);

/* Portal da família */

export const submitEnrollmentSchema = z.object({
  guardian: z.object({ relationship: z.enum(GuardianRelationship) }).optional(),
  catechumen: z.object({
    fullName: z.string().max(120),
    birthDate: isoDate,
    gender: z.enum(Gender),
    address: optionalText(200),
    sacraments: z.object({
      baptism: z.boolean(),
      firstCommunion: z.boolean(),
      baptismDate: isoDate.nullable().optional(),
      baptismParish: z.string().max(120).nullable().optional(),
      firstCommunionDate: isoDate.nullable().optional(),
      firstCommunionParish: z.string().max(120).nullable().optional(),
    }),
  }),
  catechesis: z.object({
    type: z.enum(EnrollmentType),
    level: z.enum(CatechesisLevel),
    preferredSlot: z.enum(SessionSlot),
    previousParish: optionalText(120),
    notes: optionalText(1000),
  }),
  documentsInPerson: z.boolean().optional(),
  centerId: z.uuid().optional(),
});
export type SubmitEnrollmentBody = z.infer<typeof submitEnrollmentSchema>;

/* Portal do catequista */

export const sessionDateSchema = isoDate;

export const rollSchema = z.object({
  marks: z.array(z.object({ catechumenId: z.uuid(), status: z.enum(AttendanceStatus) })).max(100),
});
export type RollBody = z.infer<typeof rollSchema>;

const grade = z.number().min(0).max(20).optional();

export const evaluationsSchema = z.object({
  rows: z
    .array(
      z.object({
        catechumenId: z.uuid(),
        grades: z.object({ T1: grade, T2: grade, T3: grade }),
        outcome: z.enum(YearOutcome).optional(),
      }),
    )
    .max(100),
});
export type EvaluationsBody = z.infer<typeof evaluationsSchema>;

/* Coordenação */

export const calendarSchema = z.object({
  label: z.string().regex(/^\d{4}\/\d{4}$/, "Escreva o ano assim: 2026/2027."),
  startsOn: isoDate,
  endsOn: isoDate,
});
export type CalendarBody = z.infer<typeof calendarSchema>;

export const createClassSchema = z
  .object({
    kind: z.enum(["REGULAR", "SPECIAL"]).optional(),
    level: z.enum(CatechesisLevel).optional(),
    sacrament: z.enum(SacramentType).optional(),
    audience: z.enum(["CHILD", "ADULT"]).optional(),
    section: z.string().trim().min(1).max(40),
    slot: z.enum(SessionSlot),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    room: z.string().max(60),
    capacity: z.number().int().min(1).max(100),
    centerId: z.uuid().optional(),
  })
  .superRefine((body, ctx) => {
    if ((body.kind ?? "REGULAR") === "SPECIAL") {
      if (!body.sacrament) {
        ctx.addIssue({ code: "custom", path: ["sacrament"], message: "Indique o sacramento." });
      }
      if (!body.audience) {
        ctx.addIssue({
          code: "custom",
          path: ["audience"],
          message: "Indique se a turma é de crianças ou de adultos.",
        });
      }
      if (body.section.trim().length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["section"],
          message: "O nome da turma especial tem entre 2 e 40 caracteres.",
        });
      }
      return;
    }
    if (!body.level) {
      ctx.addIssue({ code: "custom", path: ["level"], message: "Indique o ano da turma." });
    }
    if (!/^[A-Za-z]$/.test(body.section)) {
      ctx.addIssue({
        code: "custom",
        path: ["section"],
        message: "A turma é identificada por uma letra (A, B…).",
      });
    }
  });
export type CreateClassBody = z.infer<typeof createClassSchema>;

export const classCatechistsSchema = z.object({
  catechists: z.array(z.object({ accountId: z.uuid(), role: z.enum(ClassCatechistRole) })).max(5),
});
export type ClassCatechistsBody = z.infer<typeof classCatechistsSchema>;

export const enrollmentListSchema = z.object({
  tab: z
    .enum([
      "todas",
      "em-analise",
      "aprovadas",
      "pendentes",
      "confirmadas",
      "rejeitadas",
      "lista-de-espera",
    ])
    .default("todas"),
  search: z.string().max(100).optional(),
  stage: z.enum(["BAPTISM", "COMMUNION", "BIBLICAL", "CONFIRMATION"]).optional(),
  type: z.enum(EnrollmentType).optional(),
  sort: z.enum(["recentes", "antigas", "nome"]).default("recentes"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  centerId: z.uuid().optional(),
});
export type EnrollmentListQuery = z.infer<typeof enrollmentListSchema>;

export const enrollmentActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("request-documents"), note: optionalText(500) }),
  z.object({ kind: z.literal("confirm"), classId: z.uuid() }),
  z.object({ kind: z.literal("reject"), reason: optionalText(500) }),
  z.object({ kind: z.literal("waitlist") }),
  z.object({ kind: z.literal("reopen") }),
]);
export type EnrollmentActionBody = z.infer<typeof enrollmentActionSchema>;

/* Documentos e confirmações */

export const documentKindSchema = z.object({ kind: z.enum(["ID", "BAPTISM", "PHOTO"]) });

export const confirmSchema = z.object({
  previousEnrollmentId: z.uuid(),
  preferredSlot: z.enum(SessionSlot),
  centerId: z.uuid().optional(),
});
export type ConfirmBody = z.infer<typeof confirmSchema>;

export const confirmationSearchSchema = z.object({ search: z.string().max(100).default("") });

/* Gestão da coordenação */

export const deadlinePurposeParam = z.enum(["ENROLLMENT", "CONFIRMATION"]);

export const deadlineSchema = z.object({
  window: z.object({ startsOn: isoDate, endsOn: isoDate }).nullable(),
});
export type DeadlineBody = z.infer<typeof deadlineSchema>;

export const classListSchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}\/\d{4}$/)
    .optional(),
  centerId: z.uuid().optional(),
});

export const planClassesSchema = z.object({
  level: z.enum(CatechesisLevel),
  capacity: z.coerce.number().int().min(5).max(100),
  centerId: z.uuid().optional(),
});
export type PlanClassesQuery = z.infer<typeof planClassesSchema>;

export const generateClassesSchema = z.object({
  level: z.enum(CatechesisLevel),
  capacity: z.number().int().min(5).max(100),
  slot: z.enum(SessionSlot),
  centerId: z.uuid().optional(),
});
export type GenerateClassesBody = z.infer<typeof generateClassesSchema>;

export const catechistListSchema = z.object({
  tab: z
    .enum(["todos", "ativos", "disponiveis", "em-formacao", "indisponiveis", "inativos"])
    .default("todos"),
  search: z.string().max(100).default(""),
  centerId: z.uuid().optional(),
});
export type CatechistListQuery = z.infer<typeof catechistListSchema>;

export const catechistStatusSchema = z.object({
  status: z.enum(["IN_TRAINING", "UNAVAILABLE", "INACTIVE"]).nullable(),
  centerId: z.uuid().optional(),
});

export const presenceSchema = z.object({ status: z.enum(AttendanceStatus) });

export const catechumenListSchema = z.object({
  search: z.string().max(100).optional(),
  stage: z.enum(["BAPTISM", "COMMUNION", "BIBLICAL", "CONFIRMATION"]).optional(),
  status: z
    .enum([
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "REJECTED",
      "WAITLIST",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  centerId: z.uuid().optional(),
});
export type CatechumenListQuery = z.infer<typeof catechumenListSchema>;

/* Sacramentos */

export const sacramentTypeParam = z.enum(SacramentType);
export const sacramentRequirementParam = z.enum(SacramentRequirement);

export const candidateListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  filter: z.enum(["ALL", "READY", "PENDING"]).optional(),
});
export type CandidateListQuery = z.infer<typeof candidateListSchema>;

export const requirementSchema = z.object({ met: z.boolean() });
export type RequirementBody = z.infer<typeof requirementSchema>;

const celebrationFields = {
  date: isoDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:mm.")
    .nullable()
    .optional(),
  place: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(500).nullable().optional(),
  selection: z.object({
    classIds: z.array(z.uuid()).max(100),
    catechumenIds: z.array(z.uuid()).max(1000),
  }),
  withCommunion: z.boolean().optional(),
};

export const createCelebrationSchema = z.object({
  type: z.enum(SacramentType),
  centerId: z.uuid().optional(),
  ...celebrationFields,
});
export type CreateCelebrationBody = z.infer<typeof createCelebrationSchema>;

export const updateCelebrationSchema = z.object(celebrationFields);
export type UpdateCelebrationBody = z.infer<typeof updateCelebrationSchema>;

export const classMembersSchema = z.object({
  type: z.enum(SacramentType),
  withCommunion: z.enum(["true", "false"]).optional(),
});
export type ClassMembersQuery = z.infer<typeof classMembersSchema>;

export const completeCelebrationSchema = z.object({
  catechumenIds: z.array(z.uuid()).max(1000),
});
export type CompleteCelebrationBody = z.infer<typeof completeCelebrationSchema>;

export const receivedSacramentSchema = z.object({
  received: z.boolean(),
  date: isoDate.nullable().optional(),
  parish: z.string().max(120).nullable().optional(),
});
export type ReceivedSacramentBody = z.infer<typeof receivedSacramentSchema>;

const recordRange = {
  from: isoDate.optional(),
  to: isoDate.optional(),
};

export const sacramentRecordsSchema = z.object({
  type: z.enum(SacramentType).optional(),
  ...recordRange,
  search: z.string().trim().max(100).optional(),
  origin: z.enum(["ALL", "THIS_PARISH", "OTHER"]).default("ALL"),
  celebrationId: z.uuid().optional(),
  centerId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50),
});
export type SacramentRecordsQuery = z.infer<typeof sacramentRecordsSchema>;

export const sacramentRecordsSummarySchema = z.object(recordRange);
export type SacramentRecordsSummaryQuery = z.infer<typeof sacramentRecordsSummarySchema>;

/* Relatórios */

export const centerFilterSchema = z.object({ centerId: z.uuid().optional() });
export type CenterFilterQuery = z.infer<typeof centerFilterSchema>;

export const reportExportParam = z.enum(REPORT_EXPORTS);

/* Avisos */

export const announcementListSchema = z.object({
  audience: z.enum(["todos", "ALL", "GUARDIANS", "CATECHUMENS", "CATECHISTS"]).default("todos"),
  search: z.string().max(100).default(""),
  centerId: z.uuid().optional(),
});
export type AnnouncementListQuery = z.infer<typeof announcementListSchema>;

export const publishAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(10).max(600),
  audience: z.enum(["ALL", "GUARDIANS", "CATECHUMENS", "CATECHISTS"]),
  pinned: z.boolean(),
  /** Avisa no sino de quem o recebe. */
  notify: z.boolean(),
  /** Envia também o aviso completo por email (por omissão, não). */
  email: z.boolean().default(false),
  centerId: z.uuid().optional(),
});
export type PublishAnnouncementBody = z.infer<typeof publishAnnouncementSchema>;

export const pinAnnouncementSchema = z.object({ pinned: z.boolean() });
export type PinAnnouncementBody = z.infer<typeof pinAnnouncementSchema>;

export const myAnnouncementsSchema = z.object({
  role: z.enum(["GUARDIAN", "CATECHUMEN", "CATECHIST"]),
});
export type MyAnnouncementsQuery = z.infer<typeof myAnnouncementsSchema>;

export const portalRoleSchema = myAnnouncementsSchema;

const activityFields = {
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(3).max(400),
  kind: z.enum(["ENROLLMENT", "MEETING", "CATECHESIS", "CELEBRATION"]),
  audience: z.enum(["ALL", "GUARDIANS", "CATECHISTS"]),
  startsOn: isoDate,
  endsOn: isoDate.optional(),
};

export const calendarActivitySchema = z
  .object(activityFields)
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: "A data de fim não pode ser anterior ao início.",
    path: ["endsOn"],
  });
export type CalendarActivityBody = z.infer<typeof calendarActivitySchema>;
