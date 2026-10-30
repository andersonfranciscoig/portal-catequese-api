import { z } from "zod";

export const proofSchema = z.object({ bankAccountId: z.uuid("Escolha a conta.") });

export const paymentListSchema = z.object({
  status: z.enum(["AWAITING_PAYMENT", "UNDER_REVIEW", "PAID", "REJECTED"]).optional(),
  method: z.enum(["EXPRESS_REFERENCE", "BANK_TRANSFER", "CASH"]).optional(),
  purpose: z.enum(["ENROLLMENT", "CONFIRMATION"]).optional(),
  search: z.string().max(100).optional(),
  centerId: z.uuid().optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListSchema>;

export const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Indique o motivo.").max(300),
});

export const priceSchema = z.object({ amount: z.number().int().min(0).max(1_000_000) });

export const purposeParam = z.enum(["ENROLLMENT", "CONFIRMATION"]);

export const bankAccountSchema = z.object({
  bank: z.string().max(100),
  holder: z.string().max(100),
  accountNumber: z.string().max(40),
  iban: z.string().max(40),
  active: z.boolean().default(true),
});
export type BankAccountBody = z.infer<typeof bankAccountSchema>;
