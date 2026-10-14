import { randomUUID } from "node:crypto";

import { FileStorage, type IncomingFile, type StoredFile } from "../../application/file-storage.js";

/** Ficheiros em memória: testes e desenvolvimento sem conta no UploadThing. */
export class MemoryFileStorage extends FileStorage {
  readonly files = new Map<string, IncomingFile>();

  async upload(file: IncomingFile, folder: string): Promise<StoredFile> {
    const key = `${folder.replace(/\//g, "_")}_${randomUUID()}_${file.name}`;
    this.files.set(key, file);
    return { key, name: file.name, size: file.data.length, contentType: file.contentType };
  }

  async read(key: string) {
    const file = this.files.get(key);
    if (!file) throw new Error("Ficheiro não encontrado.");
    return file.data;
  }

  async delete(keys: string[]) {
    keys.forEach((key) => this.files.delete(key));
  }
}
