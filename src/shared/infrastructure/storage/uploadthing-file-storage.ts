import { Logger } from "@nestjs/common";
import { UTApi, UTFile } from "uploadthing/server";

import {
  FileStorage,
  StorageUnavailableError,
  type IncomingFile,
  type StoredFile,
} from "../../application/file-storage.js";

/** Validade dos links assinados usados só pela API para ler o ficheiro. */
const READ_LINK_SECONDS = 60;
/** Tentativas por operação (a rede até ao UploadThing pode falhar de vez em quando). */
const ATTEMPTS = 2;

/**
 * Ficheiros no UploadThing. O token e os endereços ficam na API: o browser
 * recebe o conteúdo pela API, depois de confirmado o acesso.
 *
 * Com `private: true` (plano pago do UploadThing) os ficheiros também ficam
 * privados no próprio UploadThing; no plano gratuito são públicos, mas com
 * endereços aleatórios que nunca são divulgados.
 */
export class UploadThingFileStorage extends FileStorage {
  private readonly api: UTApi;
  private readonly logger = new Logger("FileStorage");

  constructor(
    token: string,
    private readonly options: { private: boolean },
  ) {
    super();
    this.api = new UTApi({ token, logLevel: "Error" });
  }

  /**
   * Uma falha passageira (rede lenta) tenta-se de novo uma vez; se persistir,
   * passa a um erro claro (503) e fica no log.
   */
  private async guard<T>(operation: string, action: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await action();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (attempt < ATTEMPTS) {
          this.logger.warn(`UploadThing: ${operation} falhou (${reason}); a tentar de novo.`);
          continue;
        }
        this.logger.error(`UploadThing: falhou ${operation}: ${reason}`);
        throw new StorageUnavailableError();
      }
    }
  }

  upload(file: IncomingFile, folder: string): Promise<StoredFile> {
    return this.guard("o envio", () => this.send(file, folder));
  }

  private async send(file: IncomingFile, folder: string): Promise<StoredFile> {
    // A pasta fica no nome (o UploadThing não tem pastas): "enrollments_<id>_bi.pdf".
    const name = `${folder.replace(/[^a-zA-Z0-9-]+/g, "_")}_${file.name}`;
    // `type` vem do Blob (o tsconfig não inclui os tipos do DOM).
    const properties = { type: file.contentType, lastModified: Date.now() };
    const [result] = await this.api.uploadFiles([new UTFile([file.data], name, properties)], {
      contentDisposition: "inline",
      ...(this.options.private ? { acl: "private" as const } : {}),
    });
    if (!result?.data) throw new Error(result?.error?.message ?? "sem resposta");
    return {
      key: result.data.key,
      name: file.name,
      size: result.data.size,
      contentType: file.contentType,
    };
  }

  read(key: string) {
    return this.guard("a leitura", async () => {
      const { ufsUrl } = await this.api.generateSignedURL(key, { expiresIn: READ_LINK_SECONDS });
      const response = await fetch(ufsUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    });
  }

  async delete(keys: string[]) {
    if (keys.length) await this.guard("a remoção", () => this.api.deleteFiles(keys));
  }
}
