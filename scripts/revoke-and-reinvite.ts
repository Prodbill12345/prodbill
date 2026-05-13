/**
 * scripts/revoke-and-reinvite.ts
 * One-shot : révoque une invitation Clerk existante et en renvoie une nouvelle
 * avec le bon redirectUrl pointant vers l'app ProdBill.
 *
 * Usage :
 *   npx tsx scripts/revoke-and-reinvite.ts \
 *     --invitation-id <inv_xxx> \
 *     --email <email> \
 *     --company-id <cmp_xxx> \
 *     --clerk-org-id <org_xxx>
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClerkClient } from "@clerk/backend";

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
  const required = ["invitation-id", "email", "company-id", "clerk-org-id"];
  for (const k of required) {
    if (!args[k]) {
      console.error(`Argument manquant : --${k}`);
      process.exit(1);
    }
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prodbill.vercel.app";
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  console.log(`\nRévocation invitation ${args["invitation-id"]}…`);
  try {
    const revoked = await clerk.invitations.revokeInvitation(args["invitation-id"]);
    console.log(`  ✓ Révoquée. Status : ${revoked.status}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("revoked")) {
      console.log(`  ⚠ Déjà révoquée ou expirée — on continue.`);
    } else {
      throw e;
    }
  }

  console.log(`\nCréation nouvelle invitation pour ${args.email}…`);
  console.log(`  redirectUrl : ${appBaseUrl}/sign-up`);
  const invitation = await clerk.invitations.createInvitation({
    emailAddress: args.email,
    redirectUrl: `${appBaseUrl}/sign-up`,
    publicMetadata: {
      companyId: args["company-id"],
      role: "ADMIN",
      clerkOrgId: args["clerk-org-id"],
    },
  });

  console.log(`\n✓ Nouvelle invitation créée`);
  console.log(`  ID            : ${invitation.id}`);
  console.log(`  Email         : ${invitation.emailAddress}`);
  console.log(`  Status        : ${invitation.status}`);
  console.log(`  Redirect URL  : ${appBaseUrl}/sign-up`);
  console.log(`  Public meta   : companyId=${args["company-id"]}, clerkOrgId=${args["clerk-org-id"]}, role=ADMIN`);
  console.log();
  console.log(`Le client recevra un email Clerk avec un lien qui, après validation,`);
  console.log(`le redirigera vers ${appBaseUrl}/sign-up?__clerk_ticket=<token>`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
