import { Injectable } from "@nestjs/common";

import { AccountDirectoryService } from "../../../identity/index.js";
import { AccountDirectory } from "../../application/ports/account-directory.js";

/** Liga a porta deste módulo à consulta pública do módulo de identidade. */
@Injectable()
export class IdentityAccountDirectory extends AccountDirectory {
  constructor(private readonly identity: AccountDirectoryService) {
    super();
  }

  namesFor(accountIds: string[]) {
    return this.identity.namesFor(accountIds);
  }
}
