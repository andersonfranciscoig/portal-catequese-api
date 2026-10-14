export abstract class RefreshTokenGenerator {
  abstract generate(): string;
  abstract hash(token: string): string;
}
