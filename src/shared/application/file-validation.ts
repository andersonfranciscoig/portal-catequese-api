import { DomainError } from "../domain/domain-error.js";
import {
  ALLOWED_CONTENT_TYPES,
  type AllowedContentType,
  type IncomingFile,
} from "./file-storage.js";

export class InvalidFileError extends DomainError {
  readonly kind = "validation";
  readonly code = "files.invalid_file";
  constructor(message: string) {
    super(message);
  }
}

/** Assinatura dos primeiros bytes de cada tipo (o tipo declarado pelo browser não chega). */
function detect(data: Uint8Array): AllowedContentType | null {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => data[index] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.subarray(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

const EXTENSION: Record<AllowedContentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Aceita só PDF ou imagem (pelo conteúdo, não pelo nome) até `maxBytes`, e dá
 * ao ficheiro um nome seguro com a extensão certa.
 */
export function validateUpload(
  file: { name: string; data: Uint8Array } | undefined,
  maxBytes: number,
): IncomingFile {
  if (!file?.data.length) throw new InvalidFileError("Escolha um ficheiro.");
  if (file.data.length > maxBytes) {
    throw new InvalidFileError(
      `O ficheiro é demasiado grande (máximo ${Math.round(maxBytes / 1024 / 1024)} MB).`,
    );
  }
  const contentType = detect(file.data);
  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new InvalidFileError("Envie um PDF ou uma fotografia (JPG, PNG ou WEBP).");
  }
  const base =
    file.name
      .replace(/\.[^.]*$/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "ficheiro";
  return { name: `${base}.${EXTENSION[contentType]}`, contentType, data: file.data };
}
