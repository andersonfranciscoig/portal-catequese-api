import { z } from "zod";

import { AccountRole, Permission } from "../../../domain/account-role.js";

/**
 * Forma dos pedidos. As regras de negócio (telefone angolano, força da
 * palavra-passe…) são validadas no domínio, não aqui.
 */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => value?.trim() || undefined);

export const registerSchema = z.object({
  role: z.enum([AccountRole.GUARDIAN, AccountRole.CATECHUMEN, AccountRole.CATECHIST]),
  fullName: z.string().max(200),
  phone: z.string().max(40),
  email: z.string().max(254),
  password: z.string().max(200),
});

export type RegisterBody = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** Telefone ou email. */
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(200),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(200) });

export type RefreshBody = z.infer<typeof refreshSchema>;

export const profileSchema = z.object({
  fullName: z.string().max(200),
  phone: z.string().max(40),
  email: z.string().max(254),
});

export const verifyRegistrationSchema = z.object({
  email: z.string().max(254),
  code: z.string().max(12),
});

export type VerifyRegistrationBody = z.infer<typeof verifyRegistrationSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().max(254),
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  email: z.string().max(254),
  token: z.string().max(80),
  password: z.string().max(200),
});

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

export type ProfileBody = z.infer<typeof profileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().max(200),
});

export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;

export const addRoleSchema = z.object({ role: z.enum(AccountRole) });

export type AddRoleBody = z.infer<typeof addRoleSchema>;

/* ───────────── Administração ───────────── */

export const accountQuerySchema = z.object({
  search: optionalText(120),
  role: z.enum(AccountRole).optional(),
  status: z.enum(["active", "blocked", "pending_approval"]).optional(),
  access: z.enum(["coordination", "admin", "beta"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AccountQueryParams = z.infer<typeof accountQuerySchema>;

export const permissionsSchema = z.object({
  permissions: z.array(z.enum(Permission)).max(10),
});

export type PermissionsBody = z.infer<typeof permissionsSchema>;

export const blockSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export type BlockBody = z.infer<typeof blockSchema>;

export const catechistDecisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) });

export type CatechistDecisionBody = z.infer<typeof catechistDecisionSchema>;

export const rolesSchema = z.object({ roles: z.array(z.enum(AccountRole)).min(1).max(3) });

export type RolesBody = z.infer<typeof rolesSchema>;

export const betaAccessSchema = z.object({ betaAccess: z.boolean() });

export type BetaAccessBody = z.infer<typeof betaAccessSchema>;
