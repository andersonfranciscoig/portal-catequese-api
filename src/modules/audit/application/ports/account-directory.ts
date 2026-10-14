export abstract class AccountDirectory {
  abstract namesFor(accountIds: string[]): Promise<Record<string, string>>;
}
