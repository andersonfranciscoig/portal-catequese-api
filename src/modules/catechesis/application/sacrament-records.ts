import type { Clock } from "../../../shared/domain/clock.js";
import { UniqueId } from "../../../shared/domain/unique-id.js";
import type { Catechumen } from "../domain/catechumen.js";
import { luandaToday } from "../domain/dates.js";
import type { SacramentRecordRepository } from "../domain/repositories/catechesis.repositories.js";
import {
  assertCanRemove,
  assertCoherent,
  isInThisParish,
  type SacramentFacts,
  type SacramentRecord,
} from "../domain/sacrament-records.js";
import { SACRAMENT_TYPES, type SacramentType } from "../domain/sacraments.js";

/** Um sacramento na ficha do catequizando (os três tipos, sempre). */
export interface ReceivedSacramentView {
  type: SacramentType;
  received: boolean;
  date: string | null;
  parish: string | null;
  inThisParish: boolean;
  celebrationId: string | null;
}

export function toReceivedView(
  type: SacramentType,
  record: SacramentRecord | undefined,
): ReceivedSacramentView {
  return {
    type,
    received: Boolean(record),
    date: record?.date ?? null,
    parish: record?.parish ?? null,
    inThisParish: record ? isInThisParish(record) : false,
    celebrationId: record?.celebrationId ?? null,
  };
}

/** Os três sacramentos de um catequizando, por ordem. */
export function toReceivedViews(records: SacramentRecord[]): ReceivedSacramentView[] {
  return SACRAMENT_TYPES.map((type) =>
    toReceivedView(
      type,
      records.find((item) => item.type === type),
    ),
  );
}

/** Mudança num sacramento: os dados novos, ou `null` para retirar o registo. */
export type SacramentChange = { type: SacramentType; facts: SacramentFacts | null };

/**
 * Registos dos sacramentos recebidos. Cada mudança é validada com os restantes
 * sacramentos do catequizando (ordem e datas) e mantém os "sim/não" do
 * catequizando (`baptized`, `firstCommunion`) coerentes com os registos.
 */
export class SacramentRecords {
  constructor(
    private readonly records: SacramentRecordRepository,
    private readonly clock: Clock,
  ) {}

  async views(catechumenId: string): Promise<ReceivedSacramentView[]> {
    return toReceivedViews(await this.records.listForCatechumens([catechumenId]));
  }

  async current(catechumenId: string): Promise<Partial<Record<SacramentType, SacramentRecord>>> {
    const found = await this.records.listForCatechumens([catechumenId]);
    return Object.fromEntries(found.map((item) => [item.type, item]));
  }

  /**
   * Valida as mudanças em conjunto e devolve como gravá-las (para quem precisa
   * de validar antes de gravar outras coisas, ex.: a matrícula). `commit`
   * grava os registos e acerta os "sim/não" do catequizando — que quem chama
   * grava a seguir.
   */
  async prepare(
    catechumen: Catechumen,
    changes: SacramentChange[],
    actorId?: string,
  ): Promise<{
    commit: () => Promise<void>;
    next: Partial<Record<SacramentType, SacramentFacts>>;
  }> {
    const now = this.clock.now();
    const current = await this.current(catechumen.id.value);
    const next: Partial<Record<SacramentType, SacramentFacts>> = { ...current };
    for (const { type, facts } of changes) {
      if (facts) {
        next[type] = facts;
      } else {
        assertCanRemove(type, next);
        delete next[type];
      }
    }
    assertCoherent(next, { birthDate: catechumen.birthDate, today: luandaToday(now) });
    return {
      next,
      commit: async () => {
        for (const { type, facts } of changes) {
          if (facts) {
            await this.records.save({
              id: current[type]?.id ?? UniqueId.create().value,
              catechumenId: catechumen.id.value,
              type,
              date: facts.date,
              parish: facts.parish,
              celebrationId: facts.celebrationId,
              recordedAt: now,
              recordedBy: actorId,
            });
          } else {
            await this.records.delete(catechumen.id.value, type);
          }
          catechumen.setSacrament(type, Boolean(facts), now);
        }
      },
    };
  }
}
