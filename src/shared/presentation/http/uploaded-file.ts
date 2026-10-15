import { StreamableFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

/** Ficheiro recebido em `multipart/form-data` (campo "file"). */
export interface UploadedFileData {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Recebe um ficheiro em memória (campo "file"). O limite aqui é só de proteção;
 * o tamanho e o tipo verdadeiros são validados no caso de uso.
 */
export const SingleFileUpload = () =>
  FileInterceptor("file", { limits: { fileSize: 16 * 1024 * 1024, files: 1, fields: 5 } });

export function toIncoming(file?: UploadedFileData) {
  if (!file) return undefined;
  // O multer lê o nome do ficheiro como latin1; os browsers enviam-no em UTF-8.
  const name = Buffer.from(file.originalname, "latin1").toString("utf8");
  return { name, data: new Uint8Array(file.buffer) };
}

/** Devolve o ficheiro para ver no browser (nunca guardado em cache partilhada). */
export function fileResponse(file: { name: string; contentType: string; data: Uint8Array }) {
  return new StreamableFile(Buffer.from(file.data), {
    type: file.contentType,
    disposition: `inline; filename="${encodeURIComponent(file.name)}"`,
    length: file.data.length,
  });
}
