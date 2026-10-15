import { beforeEach, describe, expect, it } from "vitest";

import { InvalidFileError } from "../../../shared/application/file-validation.js";
import {
  BankAccountNotFoundError,
  InvalidBankAccountError,
  InvalidPaymentStateError,
  InvalidPriceError,
  PaymentNotFoundError,
  ProofNotFoundError,
} from "../domain/errors.js";
import { createPaymentsTestContext, IDS, PDF } from "../testing/payments-test-context.js";

let ctx: ReturnType<typeof createPaymentsTestContext>;
beforeEach(() => {
  ctx = createPaymentsTestContext();
});

describe("Taxas das matrículas", () => {
  it("cria a taxa com o preço em vigor, uma só vez por matrícula", async () => {
    await ctx.setPrice.execute({ actorId: IDS.finance, purpose: "ENROLLMENT", amount: 3000 });
    const payment = await ctx.enrollmentSubmitted();
    expect(payment).toMatchObject({ amount: 3000, status: "AWAITING_PAYMENT" });
    await ctx.enrollmentSubmitted();
    expect(ctx.payments.items.size).toBe(1);
    expect(
      (await ctx.mine.execute({ accountId: IDS.guardian })).map((item) => item.enrollmentCode),
    ).toEqual(["CRP-2026-48200"]);
    expect(await ctx.mine.execute({ accountId: IDS.stranger })).toEqual([]);
    await expect(
      ctx.byCode.execute({ accountId: IDS.stranger, code: "CRP-2026-48200" }),
    ).rejects.toThrow(PaymentNotFoundError);
  });

  it("a confirmação usa o preço da confirmação", async () => {
    expect((await ctx.enrollmentSubmitted("CONFIRMATION")).amount).toBe(1500);
  });

  it("valida o preço", async () => {
    await expect(
      ctx.setPrice.execute({ actorId: IDS.finance, purpose: "ENROLLMENT", amount: 12.5 }),
    ).rejects.toThrow(InvalidPriceError);
  });
});

describe("Transferência com comprovativo", () => {
  it("a família envia o comprovativo e o financeiro é avisado", async () => {
    const payment = await ctx.enrollmentSubmitted();
    const account = await ctx.bankAccount();
    expect(account.iban).toBe("AO06004000001234567891001");
    const view = await ctx.submitProof.execute({
      accountId: IDS.guardian,
      paymentId: payment.id.value,
      bankAccountId: account.id,
      file: { name: "Talão BAI.pdf", data: PDF },
    });
    expect(view).toMatchObject({
      status: "UNDER_REVIEW",
      method: "BANK_TRANSFER",
      proof: { fileName: "comprovativo-CRP-2026-48200-Talao-BAI.pdf", fileType: "application/pdf" },
    });
    expect(ctx.notifier.last("payments.proof_submitted")).toMatchObject({
      to: { permission: "FINANCE" },
    });
    const file = await ctx.readProof.execute({
      accountId: IDS.guardian,
      paymentId: payment.id.value,
    });
    expect(file.contentType).toBe("application/pdf");
    await expect(
      ctx.readProof.execute({ accountId: IDS.stranger, paymentId: payment.id.value }),
    ).rejects.toThrow(PaymentNotFoundError);
  });

  it("recusa ficheiros que não são PDF nem imagem, contas inativas e envios repetidos", async () => {
    const payment = await ctx.enrollmentSubmitted();
    const inactive = await ctx.bankAccount(false);
    const active = await ctx.bankAccount();
    const send = (bankAccountId: string, data = PDF) =>
      ctx.submitProof.execute({
        accountId: IDS.guardian,
        paymentId: payment.id.value,
        bankAccountId,
        file: { name: "x.pdf", data },
      });
    await expect(send(inactive.id)).rejects.toThrow(BankAccountNotFoundError);
    await expect(send(active.id, new TextEncoder().encode("<html>"))).rejects.toThrow(
      InvalidFileError,
    );
    await expect(send(active.id, new Uint8Array(2 * 1024 * 1024).fill(0x25))).rejects.toThrow(
      /demasiado grande/,
    );
    await send(active.id);
    await expect(send(active.id)).rejects.toThrow(InvalidPaymentStateError);
    expect(ctx.storage.files.size).toBe(1);
  });

  it("o financeiro valida ou recusa (e a família pode enviar outro)", async () => {
    const payment = await ctx.enrollmentSubmitted();
    const account = await ctx.bankAccount();
    const send = () =>
      ctx.submitProof.execute({
        accountId: IDS.guardian,
        paymentId: payment.id.value,
        bankAccountId: account.id,
        file: { name: "x.pdf", data: PDF },
      });
    await send();
    const rejected = await ctx.review.execute({
      actorId: IDS.finance,
      paymentId: payment.id.value,
      review: { kind: "reject", reason: "Valor diferente" },
    });
    expect(rejected).toMatchObject({ status: "REJECTED", reviewNote: "Valor diferente" });
    expect(ctx.notifier.last("payments.proof_rejected")?.to).toEqual({
      accountIds: [IDS.guardian],
    });

    await send();
    // O comprovativo recusado é apagado do armazenamento.
    expect(ctx.storage.files.size).toBe(1);
    const paid = await ctx.review.execute({
      actorId: IDS.finance,
      paymentId: payment.id.value,
      review: { kind: "approve" },
    });
    expect(paid).toMatchObject({ status: "PAID", paidAt: expect.any(String) });
    expect(ctx.notifier.last("payments.paid")?.title).toBe("Pagamento de Inês confirmado");
    const { summary } = await ctx.list.execute({});
    expect(summary).toMatchObject({ received: 2500, paidCount: 1, outstanding: 0 });
  });
});

describe("Numerário na secretaria", () => {
  it("a coordenação regista o pagamento", async () => {
    const payment = await ctx.enrollmentSubmitted();
    await expect(
      ctx.review.execute({
        actorId: IDS.finance,
        paymentId: payment.id.value,
        review: { kind: "approve" },
      }),
    ).rejects.toThrow(InvalidPaymentStateError);
    const paid = await ctx.review.execute({
      actorId: IDS.finance,
      paymentId: payment.id.value,
      review: { kind: "cash" },
    });
    expect(paid).toMatchObject({ status: "PAID", method: "CASH", registeredByCoordination: true });
    await expect(ctx.readProof.execute({ paymentId: payment.id.value })).rejects.toThrow(
      ProofNotFoundError,
    );
    const { items } = await ctx.list.execute({ method: "CASH", search: "ines" });
    expect(items).toHaveLength(1);
  });
});

describe("Contas da paróquia", () => {
  it("valida o IBAN e mostra só as ativas a quem paga", async () => {
    await expect(
      ctx.saveAccount.execute({
        actorId: IDS.finance,
        data: {
          bank: "BAI",
          holder: "Paróquia",
          accountNumber: "123456",
          iban: "PT50123",
          active: true,
        },
      }),
    ).rejects.toThrow(InvalidBankAccountError);
    const inactive = await ctx.bankAccount(false);
    await ctx.bankAccount();
    expect(await ctx.activeAccounts.execute()).toHaveLength(1);
    expect((await ctx.settings.execute()).bankAccounts).toHaveLength(2);
    await ctx.deleteAccount.execute({ actorId: IDS.finance, id: inactive.id });
    expect((await ctx.settings.execute()).bankAccounts).toHaveLength(1);
  });
});
