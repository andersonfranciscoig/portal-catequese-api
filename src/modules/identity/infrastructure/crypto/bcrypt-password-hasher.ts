import bcrypt from "bcryptjs";

import { PasswordHasher } from "../../domain/services/password-hasher.js";
import type { Password } from "../../domain/value-objects/password.js";

export class BcryptPasswordHasher extends PasswordHasher {
  private dummyHash?: Promise<string>;

  constructor(private readonly rounds = 12) {
    super();
  }

  hash(password: Password): Promise<string> {
    return bcrypt.hash(password.value, this.rounds);
  }

  async matches(plain: string, hash: string | undefined): Promise<boolean> {
    if (hash) return bcrypt.compare(plain, hash);
    this.dummyHash ??= bcrypt.hash("conta-inexistente", this.rounds);
    await bcrypt.compare(plain, await this.dummyHash);
    return false;
  }
}
