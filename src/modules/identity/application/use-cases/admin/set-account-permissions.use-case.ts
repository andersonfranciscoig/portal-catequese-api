import type { ActivityRecorder } from "../../../../../shared/application/activity-recorder.js";
import type { Notifier } from "../../../../../shared/application/notifier.js";
import type { UseCase } from "../../../../../shared/application/use-case.js";
import type { Clock } from "../../../../../shared/domain/clock.js";
import { Permission } from "../../../domain/account-role.js";
import {
  CoordinationCenterNotFoundError,
  CoordinationCenterRequiredError,
  LastAdministratorError,
  SelfAdministrationError,
} from "../../../domain/errors/identity.errors.js";
import type { CoordinationCenterLookup } from "../../ports/coordination-center-lookup.js";
import type { AccountRepository } from "../../../domain/repositories/account.repository.js";
import { toAdminAccountView, type AdminAccountView } from "../../account-view.js";
import { loadAdministrator, loadTarget, PERMISSION_LABEL } from "./administrator.js";

export interface SetAccountPermissionsInput {
  actorId: string;
  accountId: string;
  permissions: Permission[];
  /** Omitido: mantém o centro atual. `null`: limpa. */
  coordinationCenterId?: string | null;
}

/** O que dizer à pessoa: o acesso mais importante que ganhou, ou o resumo. */
function permissionsMessage(added: Permission[], removed: Permission[]) {
  if (added.includes(Permission.SUPER_ADMIN)) {
    return {
      kind: "identity.admin_granted",
      title: "Recebeu acesso à administração do portal",
      link: "/admin",
    };
  }
  if (added.includes(Permission.COORDINATION)) {
    return {
      kind: "identity.coordination_granted",
      title: "Recebeu acesso à área da coordenação",
      link: "/dashboard",
    };
  }
  const label = (items: Permission[]) => items.map((item) => PERMISSION_LABEL[item]).join(", ");
  return {
    kind: "identity.permissions_changed",
    title: "Os seus acessos foram atualizados",
    body: [
      added.length && `Novo: ${label(added)}.`,
      removed.length && `Retirado: ${label(removed)}.`,
    ]
      .filter(Boolean)
      .join(" "),
    link: "/conta",
  };
}

/** Substitui as permissões de uma conta (sem deixar o portal sem administração). */
export class SetAccountPermissionsUseCase implements UseCase<
  SetAccountPermissionsInput,
  AdminAccountView
> {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    private readonly centers?: CoordinationCenterLookup,
  ) {}

  async execute({
    actorId,
    accountId,
    permissions,
    coordinationCenterId,
  }: SetAccountPermissionsInput) {
    const actor = await loadAdministrator(this.accounts, actorId);
    const account = await loadTarget(this.accounts, accountId);
    const before = [...account.permissions];

    const losesAdmin =
      before.includes(Permission.SUPER_ADMIN) && !permissions.includes(Permission.SUPER_ADMIN);
    if (losesAdmin) {
      if (account.equals(actor)) {
        throw new SelfAdministrationError("Não pode retirar a sua própria administração.");
      }
      if ((await this.accounts.countActiveSuperAdmins(account.id)) === 0) {
        throw new LastAdministratorError();
      }
    }

    const now = this.clock.now();
    account.setPermissions(permissions, now);
    const stored = account.permissions;
    const needsCenter =
      stored.includes(Permission.COORDINATION) &&
      !stored.includes(Permission.GENERAL_COORDINATION) &&
      !stored.includes(Permission.SUPER_ADMIN);
    const resolved = coordinationCenterId === undefined ? account.coordinationCenterId : coordinationCenterId;
    if (!needsCenter) {
      account.setCoordinationCenter(null, now);
    } else if (!resolved) {
      throw new CoordinationCenterRequiredError();
    } else if (!this.centers || !(await this.centers.exists(resolved))) {
      throw new CoordinationCenterNotFoundError();
    } else {
      account.setCoordinationCenter(resolved, now);
    }
    await this.accounts.save(account);

    const after = account.permissions;
    const added = after.filter((item) => !before.includes(item));
    const removed = before.filter((item) => !after.includes(item));
    if (added.length || removed.length) {
      const label = (items: Permission[]) => items.map((item) => PERMISSION_LABEL[item]).join(", ");
      const parts = [
        added.length && `deu ${label(added)}`,
        removed.length && `retirou ${label(removed)}`,
      ].filter(Boolean);
      await this.activity.record({
        actorId,
        category: "ADMIN",
        action: "identity.permissions_changed",
        summary: `Alterou as permissões de ${account.fullName.value}: ${parts.join("; ")}`,
        targetAccountId: account.id.value,
      });
      await this.notifier.notify({
        to: { accountIds: [account.id.value] },
        exceptAccountId: actorId,
        ...permissionsMessage(added, removed),
      });
    }
    return toAdminAccountView(account);
  }
}
