/** Subscrição Web Push de um navegador, ligada a uma conta. */
export interface PushSubscriptionRecord {
  id: string;
  /** Endereço do serviço de push (único por navegador). */
  endpoint: string;
  p256dh: string;
  auth: string;
  accountId: string;
  userAgent?: string;
  createdAt: Date;
}

export abstract class PushSubscriptionRepository {
  /** Grava pela `endpoint`: um navegador que muda de conta passa para a nova. */
  abstract upsert(subscription: PushSubscriptionRecord): Promise<void>;
  /** Remove a subscrição se for desta conta. */
  abstract deleteForAccount(endpoint: string, accountId: string): Promise<void>;
  abstract listForAccounts(accountIds: string[]): Promise<PushSubscriptionRecord[]>;
  /** Remove subscrições que o serviço de push deu como expiradas. */
  abstract deleteByEndpoints(endpoints: string[]): Promise<void>;
}
