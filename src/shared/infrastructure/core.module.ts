import { Global, Module } from "@nestjs/common";

import { EventBus } from "../application/event-bus.js";
import { Clock, SystemClock } from "../domain/clock.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

/** Peças do núcleo usadas por todos os módulos: relógio e eventos entre módulos. */
@Global()
@Module({
  providers: [
    { provide: EventBus, useClass: InMemoryEventBus },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [EventBus, Clock],
})
export class CoreModule {}
