import { Entity } from "../../../shared/domain/entity.js";
import type { StoredFile } from "../../../shared/application/file-storage.js";
import type { UniqueId } from "../../../shared/domain/unique-id.js";

export const DOCUMENT_KINDS = ["ID", "BAPTISM", "PHOTO"] as const;
export type EnrollmentDocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABEL: Record<EnrollmentDocumentKind, string> = {
  ID: "Identificação",
  BAPTISM: "Certidão de batismo",
  PHOTO: "Fotografia",
};

export interface EnrollmentDocumentProps {
  enrollmentId: string;
  kind: EnrollmentDocumentKind;
  /** O ficheiro no armazenamento (só a chave; nunca um link). */
  file: StoredFile;
  uploadedBy: string;
  uploadedAt: Date;
}

/** Documento de uma matrícula enviado pela família (um de cada tipo). */
export class EnrollmentDocument extends Entity<EnrollmentDocumentProps> {
  static attach(props: EnrollmentDocumentProps): EnrollmentDocument {
    return new EnrollmentDocument({ ...props });
  }

  static restore(props: EnrollmentDocumentProps, id: UniqueId): EnrollmentDocument {
    return new EnrollmentDocument({ ...props }, id);
  }

  get enrollmentId() {
    return this.props.enrollmentId;
  }
  get kind() {
    return this.props.kind;
  }
  get file() {
    return this.props.file;
  }
  get uploadedBy() {
    return this.props.uploadedBy;
  }
  get uploadedAt() {
    return this.props.uploadedAt;
  }
}
