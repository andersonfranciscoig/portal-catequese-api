import type { Password } from "../value-objects/password.js";

export abstract class PasswordHasher {
  abstract hash(password: Password): Promise<string>;
  abstract matches(plain: string, hash: string | undefined): Promise<boolean>;
}
