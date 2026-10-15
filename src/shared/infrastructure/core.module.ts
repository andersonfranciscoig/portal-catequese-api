import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../../config/app-config.js";
import { EventBus } from "../application/event-bus.js";
import { FileStorage, UploadPolicy } from "../application/file-storage.js";
import { Clock, SystemClock } from "../domain/clock.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { MemoryFileStorage } from "./storage/memory-file-storage.js";
import { UploadThingFileStorage } from "./storage/uploadthing-file-storage.js";

/**
 * Peças do núcleo usadas por todos os módulos: relógio, eventos entre módulos e
 * armazenamento de ficheiros.
 */
@Global()
@Module({
  providers: [
    { provide: EventBus, useClass: InMemoryEventBus },
    { provide: Clock, useClass: SystemClock },
    {
      provide: FileStorage,
      inject: [AppConfig],
      useFactory: ({ storage }: AppConfig) =>
        storage.provider === "uploadthing"
          ? new UploadThingFileStorage(storage.uploadthingToken!, { private: storage.private })
          : new MemoryFileStorage(),
    },
    {
      provide: UploadPolicy,
      inject: [AppConfig],
      useFactory: ({ storage }: AppConfig) => new UploadPolicy(storage.maxBytes),
    },
  ],
  exports: [EventBus, Clock, FileStorage, UploadPolicy],
})
export class CoreModule {}
