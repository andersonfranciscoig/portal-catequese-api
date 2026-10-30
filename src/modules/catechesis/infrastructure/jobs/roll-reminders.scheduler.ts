import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { AppConfig } from "../../../../config/app-config.js";
import { SendRollRemindersUseCase } from "../../application/use-cases/coordination/roll-reminders.use-cases.js";

/** De quanto em quanto tempo se verificam as chamadas por lançar. */
export const ROLL_REMINDERS_EVERY_MS = 15 * 60 * 1000;

/**
 * Corre os alertas de chamada por lançar no arranque e de 15 em 15 minutos.
 * Desligado com `ROLL_REMINDERS_ENABLED=false` (e sempre nos testes). Seguro
 * com várias instâncias: o registo do alerta garante que só uma avisa.
 */
@Injectable()
export class RollRemindersScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("RollReminders");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly reminders: SendRollRemindersUseCase,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.rollReminders.enabled) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), ROLL_REMINDERS_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    // Uma execução de cada vez (uma lenta não se sobrepõe à seguinte).
    if (this.running) return;
    this.running = true;
    try {
      const { alerted, failures } = await this.reminders.execute();
      if (alerted.length) {
        this.logger.log(`Avisados ${alerted.length} encontro(s) com a chamada por lançar.`);
      }
      for (const failure of failures) this.logger.warn(`Falhou um aviso: ${failure}`);
    } catch (error) {
      this.logger.error(
        "Falhou a verificação das chamadas por lançar",
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.running = false;
    }
  }
}
