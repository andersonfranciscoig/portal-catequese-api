import type { Clock } from "../../../../shared/domain/clock.js";
import { UniqueId } from "../../../../shared/domain/unique-id.js";
import type { PushSubscriptionRepository } from "../../domain/push-subscription.js";

export interface SavePushSubscriptionInput {
  accountId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/** Liga o navegador à conta para receber notificações push (idempotente). */
export class SavePushSubscriptionUseCase {
  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: SavePushSubscriptionInput): Promise<void> {
    await this.subscriptions.upsert({
      id: UniqueId.create().value,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      accountId: input.accountId,
      userAgent: input.userAgent?.slice(0, 300) || undefined,
      createdAt: this.clock.now(),
    });
  }
}

/** Desliga o navegador (ex.: ao sair da conta ou desativar as notificações). */
export class RemovePushSubscriptionUseCase {
  constructor(private readonly subscriptions: PushSubscriptionRepository) {}

  async execute(input: { accountId: string; endpoint: string }): Promise<void> {
    await this.subscriptions.deleteForAccount(input.endpoint, input.accountId);
  }
}
