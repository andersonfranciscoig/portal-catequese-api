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
    sacraments: z.object({ baptism: z.boolean(), firstCommunion: z.boolean() }),
  }),
  catechesis: z.object({
    type: z.enum(EnrollmentType),
    level: z.enum(CatechesisLevel),
    preferredSlot: z.enum(SessionSlot),
    previousParish: optionalText(120),
    notes: optionalText(1000),
  }),
  documentsInPerson: z.boolean().optional(),
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

export const createClassSchema = z.object({
  level: z.enum(CatechesisLevel),
  section: z.string().max(1),
  slot: z.enum(SessionSlot),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  room: z.string().max(60),
  capacity: z.number().int().min(1).max(100),
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
});

export const planClassesSchema = z.object({
  level: z.enum(CatechesisLevel),
  capacity: z.coerce.number().int().min(5).max(100),
});
export type PlanClassesQuery = z.infer<typeof planClassesSchema>;

export const generateClassesSchema = z.object({
  level: z.enum(CatechesisLevel),
  capacity: z.number().int().min(5).max(100),
  slot: z.enum(SessionSlot),
});
export type GenerateClassesBody = z.infer<typeof generateClassesSchema>;

export const catechistListSchema = z.object({
  tab: z
    .enum(["todos", "ativos", "disponiveis", "em-formacao", "indisponiveis", "inativos"])
    .default("todos"),
  search: z.string().max(100).default(""),
});
export type CatechistListQuery = z.infer<typeof catechistListSchema>;

export const catechistStatusSchema = z.object({
  status: z.enum(["IN_TRAINING", "UNAVAILABLE", "INACTIVE"]).nullable(),
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

export const celebrationSchema = z.object({
  celebration: z.object({ date: isoDate, place: z.string().trim().min(3).max(120) }).nullable(),
});
export type CelebrationBody = z.infer<typeof celebrationSchema>;

/* Relatórios */

export const reportExportParam = z.enum(REPORT_EXPORTS);
