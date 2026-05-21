/**
 * scripts/migrate-to-memberships.ts
 *
 * Backfill Phase 2 : crée une Membership active pour chaque User existant
 * dans sa company historique (User.companyId).
 *
 * Idempotent : si la Membership (userId, companyId) existe déjà → skip.
 * Dry-run par défaut : log ce qui serait créé sans toucher la DB.
 * Avec --confirm : applique réellement.
 *
 * Règle de rétrocompat : avant ce backfill, requireAuth() utilise déjà
 * User.companyId comme fallback (cf. canAccessCompany). Donc Vanda reste
 * connectée et opérationnelle pendant et après le backfill — aucun
 * downtime.
 *
 * Usage :
 *   npx tsx scripts/migrate-to-memberships.ts             # dry-run
 *   npx tsx scripts/migrate-to-memberships.ts --confirm   # applique
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      companyId: true,
      createdAt: true,
      company: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n${users.length} User(s) en DB.\n`);

  let wouldCreate = 0;
  let alreadyExists = 0;
  const toCreate: typeof users = [];

  for (const u of users) {
    const existing = await prisma.membership.findUnique({
      where: { userId_companyId: { userId: u.id, companyId: u.companyId } },
      select: { id: true, revokedAt: true, joinedAt: true },
    });
    if (existing) {
      alreadyExists += 1;
      const status =
        existing.revokedAt !== null
          ? "REVOKED"
          : existing.joinedAt === null
            ? "PENDING"
            : "ACTIVE";
      console.log(
        `  [SKIP] ${u.email} → ${u.company.name}  (Membership ${existing.id} ${status})`
      );
      continue;
    }
    wouldCreate += 1;
    toCreate.push(u);
    console.log(
      `  [NEW]  ${u.email} → ${u.company.name}  (joinedAt=${u.createdAt.toISOString().slice(0, 10)})`
    );
  }

  console.log("");
  console.log(`Memberships existantes : ${alreadyExists}`);
  console.log(`Memberships à créer    : ${wouldCreate}`);

  if (wouldCreate === 0) {
    console.log("\n✓ Rien à faire — tous les users ont déjà une Membership.\n");
    await prisma.$disconnect();
    return;
  }

  if (!CONFIRM) {
    console.log(
      "\n[DRY-RUN] Relance avec --confirm pour créer les Memberships réellement.\n"
    );
    await prisma.$disconnect();
    return;
  }

  console.log("\nCréation des Memberships...");
  let created = 0;
  for (const u of toCreate) {
    await prisma.membership.create({
      data: {
        userId: u.id,
        companyId: u.companyId,
        role: "MEMBER",
        // Pas d'inviteur : ces users existaient avant le multi-user.
        invitedByUserId: null,
        invitedAt: u.createdAt,
        // joinedAt = date de création originale : ils étaient déjà actifs.
        joinedAt: u.createdAt,
      },
    });
    created += 1;
    console.log(`  ✓ ${u.email} → ${u.company.name}`);
  }

  console.log("");
  console.log(`✓ ${created} Membership(s) créée(s).`);

  // Sanity check final : compte les Memberships actives vs Users
  const finalMembershipsCount = await prisma.membership.count({
    where: { revokedAt: null, joinedAt: { not: null } },
  });
  const usersCount = users.length;
  console.log(`\nVerification finale :`);
  console.log(`  Users en DB                : ${usersCount}`);
  console.log(`  Memberships actives en DB  : ${finalMembershipsCount}`);
  if (finalMembershipsCount >= usersCount) {
    console.log("  → ✓ Coverage OK\n");
  } else {
    console.log(
      "  → ⚠ Coverage incomplet — certains users n'ont pas de Membership active. Investiguer.\n"
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
