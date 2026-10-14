import { beforeEach, describe, expect, it } from "vitest";

import { InvalidFileError } from "../../../shared/application/file-validation.js";
import { ENROLLMENT_SUBMITTED } from "../../../shared/application/integration-events.js";
import {
  ConfirmationNotAllowedError,
  EnrollmentAlreadyDecidedError,
  EnrollmentNotFoundError,
  InvalidEnrollmentError,
} from "../domain/errors/catechesis.errors.js";
import { createCatechesisTestContext, IDS } from "../testing/catechesis-test-context.js";

const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

let ctx: ReturnType<typeof createCatechesisTestContext>;
beforeEach(async () => {
  ctx = createCatechesisTestContext();
  await ctx.defineYear();
});

describe("Matrícula: período, documentos e pagamento", () => {
  it("publica o evento para a taxa e guarda 'entrego na secretaria'", async () => {
    const enrollment = await ctx.submit.execute({
      accountId: IDS.guardian,
      guardian: { relationship: "FATHER" },
      catechumen: {
        fullName: "Inês Francisco",
        birthDate: "2017-05-02",
        gender: "FEMALE",
        sacraments: { baptism: true, firstCommunion: false },
      },
      catechesis: { type: "NEW", level: "COMMUNION_1", preferredSlot: "SATURDAY_MORNING" },
      documentsInPerson: true,
    });
    const event = ctx.events.published.find((item) => item.name === ENROLLMENT_SUBMITTED);
    expect(event).toMatchObject({
      enrollmentCode: enrollment.code,
      purpose: "ENROLLMENT",
      payerAccountIds: [IDS.guardian],
    });
    expect((await ctx.detail.execute({ enrollmentId: enrollment.id })).documentsInPerson).toBe(
      true,
    );
  });

  it("recusa um período que não serve à idade", async () => {
    await expect(
      ctx.submit.execute({
        accountId: IDS.guardian,
        guardian: { relationship: "FATHER" },
        catechumen: {
          fullName: "Inês Francisco",
          birthDate: "2017-05-02",
          gender: "FEMALE",
          sacraments: { baptism: true, firstCommunion: false },
        },
        catechesis: { type: "NEW", level: "COMMUNION_1", preferredSlot: "SATURDAY_AFTERNOON" },
      }),
    ).rejects.toThrow(/a partir dos 15 anos/);
  });

  it("a família anexa documentos (um de cada tipo) e só ela e a coordenação os abrem", async () => {
    const enrollment = await ctx.enrollChild();
    const upload = (kind: "ID" | "PHOTO", data = PDF, accountId = IDS.guardian) =>
      ctx.upload.execute({
        accountId,
        enrollmentId: enrollment.id,
        kind,
        file: { name: "Bilhete de identidade.pdf", data },
      });
    const first = await upload("ID");
    expect(first).toMatchObject({
      kind: "ID",
      label: "Identificação",
      contentType: "application/pdf",
    });
    expect(first.fileName).toBe("id-Bilhete-de-identidade.pdf");
    // Um novo do mesmo tipo substitui o anterior (e apaga o ficheiro antigo).
    await upload("ID", PNG);
    await upload("PHOTO", PNG);
    const documents = await ctx.listDocuments.execute({
      accountId: IDS.guardian,
      enrollmentId: enrollment.id,
    });
    expect(documents.map((item) => `${item.kind}:${item.contentType}`).sort()).toEqual([
      "ID:image/png",
      "PHOTO:image/png",
    ]);
    expect(ctx.storage.files.size).toBe(2);

    await expect(upload("ID", PDF, IDS.stranger)).rejects.toThrow(EnrollmentNotFoundError);
    await expect(upload("ID", new TextEncoder().encode("MZ executável"))).rejects.toThrow(
      InvalidFileError,
    );
    const [photo] = documents.filter((item) => item.kind === "PHOTO");
    const family = await ctx.readDocument.execute({
      accountId: IDS.guardian,
      enrollmentId: enrollment.id,
      documentId: photo.id,
    });
    expect(family.contentType).toBe("image/png");
    const coordination = await ctx.readDocument.execute({
      enrollmentId: enrollment.id,
      documentId: photo.id,
    });
    expect(coordination.data).toEqual(PNG);
    await expect(
      ctx.readDocument.execute({
        accountId: IDS.stranger,
        enrollmentId: enrollment.id,
        documentId: photo.id,
      }),
    ).rejects.toThrow(EnrollmentNotFoundError);
  });
});

describe("Decisões da coordenação", () => {
  it("segue o percurso com histórico e avisa a família", async () => {
    const enrollment = await ctx.enrollChild();
    const act = (action: Parameters<typeof ctx.act.execute>[0]["action"]) =>
      ctx.act.execute({ actorId: IDS.coordinator, enrollmentId: enrollment.id, action });

    await act({ kind: "request-documents", note: "Falta a certidão de batismo." });
    expect(ctx.notifier.last("catechesis.documents_requested")).toMatchObject({
      to: { accountIds: [IDS.guardian] },
      body: "Falta a certidão de batismo.",
    });
    // Documento enviado com o pedido pendente: a coordenação é avisada.
    await ctx.upload.execute({
      accountId: IDS.guardian,
      enrollmentId: enrollment.id,
      kind: "BAPTISM",
      file: { name: "certidao.pdf", data: PDF },
    });
    expect(ctx.notifier.last("catechesis.documents_received")?.to).toEqual({
      permission: "COORDINATION",
    });

    await act({ kind: "approve" });
    await act({ kind: "waitlist" });
    expect(ctx.notifier.last("catechesis.enrollment_waitlisted")).toBeDefined();
    await act({ kind: "reject", reason: "Sem vagas este ano." });
    await expect(act({ kind: "approve" })).rejects.toThrow(EnrollmentAlreadyDecidedError);
    await act({ kind: "reopen" });

    const detail = await ctx.detail.execute({ enrollmentId: enrollment.id });
    expect(detail.history.map((item) => item.status)).toEqual([
      "SUBMITTED",
      "PENDING_CONFIRMATION",
      "APPROVED",
      "WAITLIST",
      "REJECTED",
      "UNDER_REVIEW",
    ]);
    expect(detail.history[4]).toMatchObject({
      note: "Sem vagas este ano.",
      actorName: "Teresa Domingos",
    });
    expect(detail.documents.map((item) => item.kind)).toEqual(["BAPTISM"]);
    expect(detail.guardian).toMatchObject({
      fullName: "Anderson Francisco",
      relationship: "FATHER",
    });
  });

  it("lista por separador com os números de cada um", async () => {
    const klass = await ctx.classWithCatechist();
    const first = await ctx.enrollChild();
    await ctx.enrollChild({ fullName: "Rui Francisco", birthDate: "2016-01-01" });
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: first.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    const page = await ctx.listEnrollments.execute({
      tab: "em-analise",
      search: "rui",
      sort: "nome",
      page: 1,
      pageSize: 20,
    });
    expect(page.items.map((item) => item.catechumenName)).toEqual(["Rui Francisco"]);
    expect(page.items[0]).toMatchObject({ guardianName: "Anderson Francisco", stage: "COMMUNION" });
    const all = await ctx.listEnrollments.execute({
      tab: "todas",
      sort: "recentes",
      page: 1,
      pageSize: 1,
    });
    expect(all).toMatchObject({ total: 2, pageCount: 2 });
    expect(all.counts).toMatchObject({ todas: 2, "em-analise": 1, confirmadas: 1 });
    const confirmed = await ctx.detail.execute({ enrollmentId: first.id });
    expect(confirmed).toMatchObject({ classLabel: "Turma A" });
    expect(confirmed.classOptions[0]).toMatchObject({ enrolled: 1, catechistName: "Maria José" });
  });

  it("recusada já não recebe documentos", async () => {
    const enrollment = await ctx.enrollChild();
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "REJECTED",
    });
    await expect(
      ctx.upload.execute({
        accountId: IDS.guardian,
        enrollmentId: enrollment.id,
        kind: "ID",
        file: { name: "bi.pdf", data: PDF },
      }),
    ).rejects.toThrow(InvalidEnrollmentError);
  });
});

describe("Confirmação do ano seguinte", () => {
  /** Ano 2025/2026 concluído (confirmado numa turma) e o novo ano 2026/2027. */
  async function previousYear(outcome?: "PASSED" | "REPEAT") {
    await ctx.setCalendar.execute({
      actorId: IDS.coordinator,
      label: "2025/2026",
      startsOn: "2025-09-27",
      endsOn: "2026-07-04",
    });
    const klass = await ctx.classWithCatechist();
    const enrollment = await ctx.enrollChild();
    await ctx.decide({
      actorId: IDS.coordinator,
      enrollmentId: enrollment.id,
      decision: "CONFIRMED",
      classId: klass.id,
    });
    if (outcome) {
      await ctx.evaluations.saveMany([
        {
          classId: klass.id,
          catechumenId: enrollment.catechumenId,
          grades: { T1: outcome === "PASSED" ? 15 : 7 },
          outcome,
          updatedBy: IDS.catechist,
          updatedAt: ctx.clock.now(),
        },
      ]);
    }
    await ctx.defineYear();
    return enrollment;
  }

  it("a família confirma no nível seguinte e a matrícula fica aprovada", async () => {
    const previous = await previousYear("PASSED");
    const [candidate] = await ctx.confirmations.execute({ accountId: IDS.guardian });
    expect(candidate).toMatchObject({
      kind: "eligible",
      nextLevel: "COMMUNION_2",
      defaultSlot: "SATURDAY_MORNING",
      record: { code: previous.code, section: "A", catechistName: "Maria José", outcome: "PASSED" },
    });

    await expect(
      ctx.confirm.execute({
        actorId: IDS.guardian,
        previousEnrollmentId: previous.id,
        preferredSlot: "SATURDAY_AFTERNOON",
      }),
    ).rejects.toThrow(ConfirmationNotAllowedError);
    const receipt = await ctx.confirm.execute({
      actorId: IDS.guardian,
      previousEnrollmentId: previous.id,
      preferredSlot: "SATURDAY_MORNING",
    });
    expect(receipt).toMatchObject({
      previousCode: previous.code,
      level: "COMMUNION_2",
      status: "APPROVED",
      catecheticalYear: "2026/2027",
    });
    expect(ctx.events.published.at(-1)).toMatchObject({ purpose: "CONFIRMATION" });
    expect(ctx.notifier.last("catechesis.confirmation_submitted")?.to).toEqual({
      permission: "COORDINATION",
    });

    const [after] = await ctx.confirmations.execute({ accountId: IDS.guardian });
    expect(after).toMatchObject({ kind: "already-confirmed", confirmedCode: receipt.code });
    await expect(
      ctx.confirm.execute({
        actorId: IDS.guardian,
        previousEnrollmentId: previous.id,
        preferredSlot: "SATURDAY_MORNING",
      }),
    ).rejects.toThrow(/já foi confirmada/);
  });

  it("quem repete fica no mesmo nível; outra família não confirma", async () => {
    const previous = await previousYear("REPEAT");
    const [candidate] = await ctx.confirmations.execute({ accountId: IDS.guardian });
    expect(candidate).toMatchObject({ kind: "eligible", nextLevel: "COMMUNION_1" });
    await expect(
      ctx.confirm.execute({
        actorId: IDS.stranger,
        previousEnrollmentId: previous.id,
        preferredSlot: "SATURDAY_MORNING",
      }),
    ).rejects.toThrow(EnrollmentNotFoundError);
  });

  it("a coordenação procura e confirma em nome da família", async () => {
    const previous = await previousYear();
    expect(await ctx.searchConfirmations.execute({ search: "i" })).toEqual([]);
    const found = await ctx.searchConfirmations.execute({ search: "inês" });
    expect(found.map((item) => item.record.code)).toEqual([previous.code]);
    const receipt = await ctx.confirm.execute({
      actorId: IDS.coordinator,
      previousEnrollmentId: previous.id,
      preferredSlot: "SUNDAY_AFTER_MASS",
      assisted: true,
    });
    expect(receipt.slot).toBe("SUNDAY_AFTER_MASS");
    expect(ctx.activity.actions()).toContain("catechesis.confirmation_assisted");
  });
});
