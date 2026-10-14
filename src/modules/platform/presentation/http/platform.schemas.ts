import { z } from "zod";

import { AccessProfile } from "../../domain/access-request.js";
import { LaunchMode } from "../../domain/platform-settings.js";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => value?.trim() || undefined);

export const accessRequestSchema = z.object({
  fullName: z.string().max(200),
  phone: z.string().max(40),
  email: optionalText(254),
  profile: z.enum(AccessProfile),
  message: optionalText(500),
});

export type AccessRequestBody = z.infer<typeof accessRequestSchema>;

export const launchModeSchema = z.object({ mode: z.enum(LaunchMode) });

export type LaunchModeBody = z.infer<typeof launchModeSchema>;

export const portalStatusSchema = z.object({
  open: z.boolean(),
  message: optionalText(500),
  reopensAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type PortalStatusBody = z.infer<typeof portalStatusSchema>;

export const accessRequestListSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export type AccessRequestListQuery = z.infer<typeof accessRequestListSchema>;

export const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(300),
});

export type DecisionBody = z.infer<typeof decisionSchema>;
