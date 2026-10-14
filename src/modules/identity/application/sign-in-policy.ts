import type { Account } from "../domain/account.js";
import {
  AccountBlockedError,
  BetaAccessRequiredError,
  PortalClosedError,
} from "../domain/errors/identity.errors.js";
import type { LaunchAccessPolicy } from "../../../shared/application/launch-access-policy.js";

/**
 * Quem pode usar o portal agora: conta não bloqueada; com o portal encerrado,
 * só a administração; na fase de testes, só testadores aceites e a administração.
 */
export class SignInPolicy {
  constructor(private readonly launch: LaunchAccessPolicy) {}

  async assertCanSignIn(account: Account): Promise<void> {
    if (account.isBlocked) throw new AccountBlockedError(account.blockedReason);
    if (account.isSuperAdmin) return;
    const launch = await this.launch.snapshot();
    if (!launch.portalOpen) throw new PortalClosedError(launch.closedMessage);
    if (launch.mode === "BETA" && !account.betaAccess) throw new BetaAccessRequiredError();
  }

  /** Antes de criar conta: portal aberto e, em testes, pedido de acesso aceite. */
  async assertCanRegister(phone: string, email?: string): Promise<{ betaAccess: boolean }> {
    const launch = await this.launch.snapshot();
    if (!launch.portalOpen) throw new PortalClosedError(launch.closedMessage);
    const approved = await this.launch.isApprovedForBeta(phone, email);
    if (launch.mode === "BETA" && !approved) throw new BetaAccessRequiredError();
    return { betaAccess: approved };
  }
}
