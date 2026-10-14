import "dotenv/config";

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/shared/infrastructure/database/generated/client.js";

/** O mesmo custo usado pela aplicação (BcryptPasswordHasher). */
const BCRYPT_ROUNDS = 12;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Defina ${name} no .env.`);
  return value;
}

/** Telemóvel angolano em E.164 (+2449XXXXXXXX), como no domínio. */
function angolanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^(00)?244/, "");
  if (!/^9\d{8}$/.test(digits)) throw new Error(`SEED_ADMIN_PHONE inválido: ${raw}`);
  return `+244${digits}`;
}

/** As mesmas regras da aplicação: 8+ caracteres, letras e números, até 72 bytes. */
function assertStrongPassword(password: string) {
  if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    throw new Error("SEED_ADMIN_PASSWORD: use pelo menos 8 caracteres, com letras e números.");
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("SEED_ADMIN_PASSWORD é demasiado longa (máximo 72 bytes).");
  }
}

/**
 * Prepara a base de dados:
 * - a primeira conta de administração geral (sem ela, ninguém gere o portal);
 * - a configuração da plataforma (fase de testes, portal aberto).
 * Idempotente: pode correr várias vezes. Se a conta já existir, garante só que é
 * administração ativa — não altera a palavra-passe.
 */
async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }),
  });
  try {
    const fullName = required("SEED_ADMIN_NAME");
    const phone = angolanPhone(required("SEED_ADMIN_PHONE"));
    const email = required("SEED_ADMIN_EMAIL").toLowerCase();
    const password = required("SEED_ADMIN_PASSWORD");
    assertStrongPassword(password);

    const existing = await prisma.account.findFirst({ where: { OR: [{ phone }, { email }] } });
    const now = new Date();
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: {
          permissions: { set: [...new Set([...existing.permissions, "SUPER_ADMIN" as const])] },
          status: "ACTIVE",
          blockedReason: null,
          blockedAt: null,
          betaAccess: true,
          updatedAt: now,
        },
      });
      console.log(
        `Administração garantida na conta existente: ${existing.fullName} (${existing.phone})`,
      );
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          // O tipo de conta não limita a administração (que tem todas as permissões).
          roles: ["GUARDIAN"],
          fullName,
          phone,
          email,
          // Só o hash é guardado; a palavra-passe em claro nunca chega à base de dados.
          passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          permissions: ["SUPER_ADMIN"],
          status: "ACTIVE",
          betaAccess: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      console.log(`Administração criada: ${fullName} (${phone}, ${email})`);
    }

    await prisma.platformSettings.upsert({
      where: { id: "platform" },
      update: {},
      create: { id: "platform", launchMode: "BETA", portalOpen: true },
    });
    console.log("Plataforma pronta (fase de testes, portal aberto).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
