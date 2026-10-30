import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/shared/infrastructure/database/generated/client.js";

const BCRYPT_ROUNDS = 12;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Defina ${name} no .env.`);
  return value;
}

function angolanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^(00)?244/, "");
  if (!/^9\d{8}$/.test(digits)) throw new Error(`SEED_ADMIN_PHONE inválido: ${raw}`);
  return `+244${digits}`;
}

function assertStrongPassword(password: string) {
  if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    throw new Error("SEED_ADMIN_PASSWORD: use pelo menos 8 caracteres, com letras e números.");
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("SEED_ADMIN_PASSWORD é demasiado longa (máximo 72 bytes).");
  }
}

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
          roles: ["GUARDIAN"],
          fullName,
          phone,
          email,
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

    // Só cria: datas alteradas pela coordenação não são repostas.
    await prisma.catecheticalCalendar.upsert({
      where: { id: "catechesis" },
      update: {},
      create: {
        id: "catechesis",
        label: "2026/2027",
        startsOn: "2026-09-26",
        endsOn: "2027-07-03",
        // Prazos das famílias (a coordenação muda-os em Configurações).
        enrollmentStartsOn: "2026-09-14",
        enrollmentEndsOn: "2026-10-31",
        confirmationStartsOn: "2026-09-01",
        confirmationEndsOn: "2026-10-31",
        updatedAt: now,
      },
    });
    console.log("Ano catequético 2026/2027 definido (com os prazos das famílias).");

    const centers = [
      ["a1000000-0000-4000-8000-000000000001", "Centro Sede", "Sede da paróquia"],
      ["a1000000-0000-4000-8000-000000000002", "Santa Teresinha", "Santa Teresinha"],
      ["a1000000-0000-4000-8000-000000000003", "Santo Expedito", "Santo Expedito"],
    ] as const;
    for (const [id, name, location] of centers) {
      await prisma.center.upsert({
        where: { id },
        update: { name, location, status: "ACTIVE", updatedAt: now },
        create: { id, name, location, status: "ACTIVE", createdAt: now, updatedAt: now },
      });
    }
    console.log("Centros de catequese: Sede, Santa Teresinha e Santo Expedito.");

    const sede = centers[0][0];
    for (const [type, date] of [
      ["FIRST_COMMUNION", "2027-05-30"],
      ["CONFIRMATION", "2027-06-20"],
    ] as const) {
      const existing = await prisma.sacramentCelebration.findFirst({
        where: { catecheticalYear: "2026/2027", type, centerId: sede },
      });
      if (!existing) {
        await prisma.sacramentCelebration.create({
          data: {
            id: randomUUID(),
            catecheticalYear: "2026/2027",
            type,
            date,
            place: "Igreja Cristo Rei da Paz",
            centerId: sede,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    }
    console.log("Primeira Comunhão e Crisma de 2026/2027 marcadas.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
