import { SetMetadata } from "@nestjs/common";

import type { Permission } from "../../../domain/account-role.js";

export const REQUIRED_PERMISSIONS = "identity:required-permissions";

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
