/**
 * scripts/repair-membership.ts
 * Réparation manuelle quand l'invitation Clerk a été acceptée hors du flow
 * /sign-up → /onboarding de l'app : le user Clerk existe, mais il n'est
 * ni membre de l'org Clerk, ni présent dans la table Prisma User.
 *
 * Ce script :
 *  1. ajoute le user Clerk à l'org avec le rôle "org:admin"
 *  2. crée la row Prisma User correspondante (role ADMIN, companyId)
 *
 * Idempotent : si le user est déjà membre / si la row Prisma existe déjà,
 * le script log et passe.
 *
 * Usage :
 *   npx tsx scripts/repair-membership.ts \
 *     --clerk-user-id <user_xxx> \
 *     --clerk-org-id <org_xxx> \
 *     --company-id <cmp_xxx> \
 *     --role <ADMIN|DIRECTEUR_PROD|CHARGE_DE_PROD|COMPTABLE|STAGIAIRE>
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) out[a.slice(2)] = args[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const required = ["clerk-user-id", "clerk-org-id", "company-id", "role"];
  for (const k of required) {
    if (!args[k]) {
      console.error(`Argument manquant : --${k}`);
      process.exit(1);
    }
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  // ─── 1. État avant ──────────────────────────────────────────────────────────
  console.log(`\n=== État avant réparation ===`);
  const user = await clerk.users.getUser(args["clerk-user-id"]);
  const email = user.emailAddresses[0]?.emailAddress ?? "";
  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
  console.log(`  Clerk user      : ${user.id} (${email})`);
  console.log(`  Nom complet     : ${fullName}`);

  const company = await prisma.company.findUnique({ where: { id: args["company-id"] } });
  if (!company) throw new Error(`Company ${args["company-id"]} introuvable en DB`);
  console.log(`  Company         : ${company.id} (${company.name})`);
  if (company.clerkOrgId !== args["clerk-org-id"]) {
    throw new Error(
      `Mismatch : Company.clerkOrgId=${company.clerkOrgId} mais argument=${args["clerk-org-id"]}`
    );
  }

  // ─── 2. Membership Clerk ────────────────────────────────────────────────────
  console.log(`\n=== Étape 1/2 — Membership Clerk org ===`);
  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: args["clerk-org-id"],
  });
  const existingMembership = memberships.data.find(
    (m) => m.publicUserData?.userId === args["clerk-user-id"]
  );
  if (existingMembership) {
    console.log(
      `  ⚠ Déjà membre — role=${existingMembership.role}, id=${existingMembership.id}. Skip.`
    );
  } else {
    const membership = await clerk.organizations.createOrganizationMembership({
      organizationId: args["clerk-org-id"],
      userId: args["clerk-user-id"],
      role: "org:admin",
    });
    console.log(`  ✓ Membership créé : id=${membership.id}, role=${membership.role}`);
  }

  // ─── 3. Row Prisma User ─────────────────────────────────────────────────────
  console.log(`\n=== Étape 2/2 — Row Prisma User ===`);
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: args["clerk-user-id"] },
  });
  if (existingUser) {
    console.log(
      `  ⚠ User Prisma existe déjà : id=${existingUser.id}, role=${existingUser.role}, companyId=${existingUser.companyId}. Skip.`
    );
  } else {
    const prismaUser = await prisma.user.create({
      data: {
        clerkId: args["clerk-user-id"],
        email,
        name: fullName,
        role: args.role as
          | "ADMIN"
          | "DIRECTEUR_PROD"
          | "CHARGE_DE_PROD"
          | "COMPTABLE"
          | "STAGIAIRE",
        companyId: args["company-id"],
      },
    });
    console.log(
      `  ✓ User Prisma créé : id=${prismaUser.id}, role=${prismaUser.role}, companyId=${prismaUser.companyId}`
    );
  }

  // ─── 4. État après ──────────────────────────────────────────────────────────
  console.log(`\n=== Vérification finale ===`);
  const finalMemberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: args["clerk-org-id"],
  });
  const finalMember = finalMemberships.data.find(
    (m) => m.publicUserData?.userId === args["clerk-user-id"]
  );
  console.log(
    `  Org membership  : ${finalMember ? `OK (role=${finalMember.role})` : "✗ ABSENT"}`
  );
  const finalUser = await prisma.user.findUnique({
    where: { clerkId: args["clerk-user-id"] },
  });
  console.log(
    `  Prisma User     : ${finalUser ? `OK (id=${finalUser.id}, role=${finalUser.role})` : "✗ ABSENT"}`
  );

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prodbill.vercel.app";
  console.log(`\nURL de connexion à envoyer au client : ${appBaseUrl}/sign-in`);
}

main()
  .catch((err) => {
    console.error("Erreur fatale :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
