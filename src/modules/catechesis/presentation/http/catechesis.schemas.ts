import { z } from "zod";

import {
  AttendanceStatus,
  CatechesisLevel,
  ClassCatechistRole,
  EnrollmentStatus,
  EnrollmentType,
  Gender,
  GuardianRelationship,
  SessionSlot,
  YearOutcome,
} from "../../domain/catechesis.js";

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

export const enrollmentListSchema = z.object({ status: z.enum(EnrollmentStatus).optional() });
export type EnrollmentListQuery = z.infer<typeof enrollmentListSchema>;

export const enrollmentDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("CONFIRMED"), classId: z.uuid() }),
  z.object({ decision: z.literal("REJECTED") }),
]);
export type EnrollmentDecisionBody = z.infer<typeof enrollmentDecisionSchema>;
