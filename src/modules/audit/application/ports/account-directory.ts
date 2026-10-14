/** Nomes das contas, para mostrar quem fez cada ação. */
export abstract class AccountDirectory {
  abstract namesFor(accountIds: string[]): Promise<Record<string, string>>;
}
