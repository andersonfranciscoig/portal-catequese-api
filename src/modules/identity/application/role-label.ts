import { AccountRole } from "../domain/account-role.js";

export const ROLE_LABEL: Record<AccountRole, string> = {
  [AccountRole.GUARDIAN]: "encarregado de educação",
  [AccountRole.CATECHUMEN]: "catecúmeno adulto",
  [AccountRole.CATECHIST]: "catequista",
};
