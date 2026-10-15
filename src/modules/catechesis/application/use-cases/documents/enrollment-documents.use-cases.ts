import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { FileStorage, UploadPolicy } from "../../../../../shared/application/file-storage.js";
import { validateUpload } from "../../../../../shared/application/file-validation.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../../shared/domain/unique-id.js";
import {
  DOCUMENT_LABEL,
  EnrollmentDocument,
  type EnrollmentDocumentKind,
} from "../../../domain/enrollment-document.js";
import {
  DocumentNotFoundError,
  EnrollmentNotFoundError,
  InvalidEnrollmentError,
} from "../../../domain/errors/catechesis.errors.js";
import type {
  CatechumenRepository,
  EnrollmentDocumentRepository,
  EnrollmentRepository,
} from "../../../domain/repositories/catechesis.repositories.js";
import { loadFamilyEnrollment } from "../../family-access.js";

export interface EnrollmentDocumentView {
  id: string;
  kind: EnrollmentDocumentKind;
  label: string;
  fileName: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

export function toDocumentView(document: EnrollmentDocument): EnrollmentDocumentView {
  return {
    id: document.id.value,
    kind: document.kind,
    label: DOCUMENT_LABEL[document.kind],
    fileName: document.file.name,
    size: document.file.size,
    contentType: document.file.contentType,
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

export interface UploadEnrollmentDocumentInput {
  accountId: string;
  enrollmentId: string;
  kind: EnrollmentDocumentKind;
  file?: { name: string; data: Uint8Array };
}

/**
 * A família anexa um documento à matrícula (identificação, certidão de batismo
 * ou fotografia). Um novo do mesmo tipo substitui o anterior.
 */
export class UploadEnrollmentDocumentUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly documents: EnrollmentDocumentRepository,
    private readonly storage: FileStorage,
    private readonly policy: UploadPolicy,
    private readonly activity: ActivityRecorder,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute({
    accountId,
    enrollmentId,
    kind,
    file,
  }: UploadEnrollmentDocumentInput): Promise<EnrollmentDocumentView> {
    const { enrollment, catechumen } = await loadFamilyEnrollment(
      this.enrollments,
      this.catechumens,
      accountId,
      enrollmentId,
    );
    if (!enrollment.acceptsDocuments) {
      throw new InvalidEnrollmentError("Esta matrícula foi recusada: já não recebe documentos.");
    }
    const valid = validateUpload(file, this.policy.maxBytes);
    const stored = await this.storage.upload(
      { ...valid, name: `${kind.toLowerCase()}-${valid.name}` },
      `enrollments/${enrollment.id.value}`,
    );
    const document = EnrollmentDocument.attach({
      enrollmentId: enrollment.id.value,
      kind,
      file: stored,
      uploadedBy: accountId,
      uploadedAt: this.clock.now(),
    });
    let previous: EnrollmentDocument | null;
    try {
      previous = await this.documents.save(document);
    } catch (error) {
      // Sem registo, o ficheiro enviado ficaria perdido no armazenamento.
      await this.storage.delete([stored.key]).catch(() => undefined);
      throw error;
    }
    if (previous) await this.storage.delete([previous.file.key]).catch(() => undefined);

    await this.activity.record({
      actorId: accountId,
      category: "ENROLLMENT",
      action: "catechesis.document_uploaded",
      summary: `Enviou ${DOCUMENT_LABEL[kind].toLowerCase()} da matrícula ${enrollment.code}`,
    });
    // Documentos pedidos pela coordenação: avisa que chegaram.
    if (enrollment.status === "PENDING_CONFIRMATION") {
      await this.notifier.notify({
        to: { permission: "COORDINATION" },
        kind: "catechesis.documents_received",
        title: "Documentos recebidos",
        body: `${catechumen.fullName} enviou ${DOCUMENT_LABEL[kind].toLowerCase()} (${enrollment.code}).`,
        link: `/dashboard/matriculas?matricula=${enrollment.id.value}`,
        exceptAccountId: accountId,
      });
    }
    return toDocumentView(document);
  }
}

/** Documentos de uma matrícula da família. */
export class ListEnrollmentDocumentsUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly documents: EnrollmentDocumentRepository,
  ) {}

  async execute({ accountId, enrollmentId }: { accountId: string; enrollmentId: string }) {
    await loadFamilyEnrollment(this.enrollments, this.catechumens, accountId, enrollmentId);
    return (await this.documents.listForEnrollment(enrollmentId)).map(toDocumentView);
  }
}

export interface DocumentFile {
  name: string;
  contentType: string;
  data: Uint8Array;
}

/**
 * O conteúdo de um documento, para a família da matrícula ou para a coordenação
 * (`accountId` ausente: o controller já confirmou a permissão).
 */
export class ReadEnrollmentDocumentUseCase {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly catechumens: CatechumenRepository,
    private readonly documents: EnrollmentDocumentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute({
    accountId,
    enrollmentId,
    documentId,
  }: {
    accountId?: string;
    enrollmentId: string;
    documentId: string;
  }): Promise<DocumentFile> {
    if (accountId) {
      await loadFamilyEnrollment(this.enrollments, this.catechumens, accountId, enrollmentId);
    } else if (!(await this.enrollments.findById(UniqueId.from(enrollmentId)))) {
      throw new EnrollmentNotFoundError();
    }
    const document = await this.documents.findById(UniqueId.from(documentId));
    if (!document || document.enrollmentId !== enrollmentId) throw new DocumentNotFoundError();
    return {
      name: document.file.name,
      contentType: document.file.contentType,
      data: await this.storage.read(document.file.key),
    };
  }
}
