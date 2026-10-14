import { DomainError } from "../domain/domain-error.js";

/** O armazenamento não respondeu (rede, serviço em baixo): pode tentar-se de novo. */
export class StorageUnavailableError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "files.storage_unavailable";
  constructor() {
    super("Não foi possível guardar ou abrir o ficheiro agora. Tente de novo dentro de momentos.");
  }
}

/** Ficheiro recebido de quem usa o portal (já validado: tipo e tamanho). */
export interface IncomingFile {
  name: string;
  contentType: AllowedContentType;
  data: Uint8Array;
}

/** Ficheiro guardado: só a chave fica na base de dados (nunca um link público). */
export interface StoredFile {
  key: string;
  name: string;
  size: number;
  contentType: AllowedContentType;
}

/** Documentos e comprovativos: PDF ou fotografia. */
export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/**
 * Armazenamento de ficheiros sensíveis (documentos de identificação, certidões,
 * comprovativos). O endereço do ficheiro nunca chega ao browser: quem tem acesso
 * pede-o à API, que o lê aqui e o devolve. Implementação: UploadThing (ou memória).
 */
export abstract class FileStorage {
  /** `folder` agrupa os ficheiros (ex.: "enrollments/<id>"). */
  abstract upload(file: IncomingFile, folder: string): Promise<StoredFile>;
  /** O conteúdo do ficheiro (para a API o devolver a quem tem acesso). */
  abstract read(key: string): Promise<Uint8Array>;
  abstract delete(keys: string[]): Promise<void>;
}

/** Limites dos ficheiros enviados (configuração). */
export class UploadPolicy {
  constructor(readonly maxBytes: number) {}
}
