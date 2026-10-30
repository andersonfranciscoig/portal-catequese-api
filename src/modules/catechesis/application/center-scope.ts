import { SEDE_CENTER_ID } from "../../../shared/domain/parish-centers.js";
import type { Center } from "../domain/center.js";
import {
  CenterForbiddenError,
  CenterInactiveError,
  CenterNotFoundError,
  ParishOnlyError,
} from "../domain/errors/catechesis.errors.js";
import type { CenterRepository } from "../domain/repositories/catechesis.repositories.js";

/** Quem vê a paróquia inteira, ou só o centro da conta. */
export type CenterScope = { kind: "parish" } | { kind: "center"; centerId: string };

/**
 * Centro efetivo de uma listagem.
 * A paróquia usa o filtro se vier. O centro ignora o filtro e força o seu.
 */
export function listedCenter(scope: CenterScope | undefined, queryCenterId?: string): string | undefined {
  if (!scope || scope.kind === "parish") return queryCenterId;
  if (queryCenterId && queryCenterId !== scope.centerId) throw new CenterForbiddenError();
  return scope.centerId;
}

export function assertSameCenter(scope: CenterScope | undefined, resourceCenterId: string) {
  if (scope?.kind === "center" && scope.centerId !== resourceCenterId) {
    throw new CenterForbiddenError();
  }
}

export function assertParish(scope: CenterScope | undefined) {
  if (scope?.kind === "center") throw new ParishOnlyError();
}

export function matchesCenter(resourceCenterId: string | undefined, centerId?: string) {
  return !centerId || (resourceCenterId ?? SEDE_CENTER_ID) === centerId;
}

/**
 * Centro a gravar numa criação.
 * Sem âmbito e sem id (testes antigos) fica o Centro Sede, sem ir à base.
 * Paróquia: o id é obrigatório. Centro: força o da conta.
 */
export async function resolveWriteCenter(
  centers: CenterRepository | undefined,
  scope: CenterScope | undefined,
  bodyCenterId: string | undefined,
): Promise<string> {
  if (scope?.kind === "center") {
    if (bodyCenterId && bodyCenterId !== scope.centerId) throw new CenterForbiddenError();
    return (await requireActive(centers, scope.centerId)).id.value;
  }
  if (!scope && !bodyCenterId) return SEDE_CENTER_ID;
  if (!bodyCenterId) throw new CenterNotFoundError("Indique o centro.");
  return (await requireActive(centers, bodyCenterId)).id.value;
}

async function requireActive(centers: CenterRepository | undefined, id: string): Promise<Center> {
  const center = centers ? await centers.findById(id) : null;
  if (!center) throw new CenterNotFoundError();
  if (!center.isActive) throw new CenterInactiveError();
  return center;
}
