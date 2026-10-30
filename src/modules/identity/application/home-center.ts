import {
  CenterInactiveError,
  CoordinationCenterNotFoundError,
  HomeCenterRequiredError,
} from "../domain/errors/identity.errors.js";
import type { CoordinationCenterLookup } from "./ports/coordination-center-lookup.js";

/** Confirma que o centro do cadastro existe e está ativo. */
export async function assertActiveHomeCenter(
  centers: CoordinationCenterLookup,
  centerId: string | undefined,
) {
  if (!centerId) throw new HomeCenterRequiredError();
  const status = await centers.status(centerId);
  if (status === null) throw new CoordinationCenterNotFoundError();
  if (status === "INACTIVE") throw new CenterInactiveError();
}
