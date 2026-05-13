/**
 * scripts/inspect-clerk-state.ts
 * Inspecte l'état Clerk pour un email + une org donnés (lecture seule).
 *
 * Usage :
 *   npx tsx scripts/inspect-clerk-state.ts \
 *     --email <email> \
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
  if (!args.email || !args["clerk-org-id"]) {
    console.error("Usage : --email <email> --clerk-org-id <org_xxx>");
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  console.log(`\n=== Recherche du user Clerk pour ${args.email} ===`);
  const usersList = await clerk.users.getUserList({ emailAddress: [args.email] });
  if (usersList.totalCount === 0) {
    console.log("  Aucun user Clerk trouvé. Étrange — l'invitation est marquée acceptée.");
    return;
  }
  for (const u of usersList.data) {
    console.log(`  User ID         : ${u.id}`);
    console.log(`  Email           : ${u.emailAddresses[0]?.emailAddress}`);
    console.log(`  Email verified  : ${u.emailAddresses[0]?.verification?.status}`);
    console.log(`  Created         : ${new Date(u.createdAt).toISOString()}`);
    console.log(`  Last sign-in    : ${u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : "—"}`);
    console.log(`  Public metadata : ${JSON.stringify(u.publicMetadata)}`);
    console.log(`  External accts  : ${u.externalAccounts.length}`);
  }

  const user = usersList.data[0];

  console.log(`\n=== Memberships de l'org ${args["clerk-org-id"]} ===`);
  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: args["clerk-org-id"],
  });
  console.log(`  Total : ${memberships.totalCount}`);
  for (const m of memberships.data) {
    console.log(`  • ${m.publicUserData?.identifier} — role=${m.role} — userId=${m.publicUserData?.userId}`);
  }
  const isMember = memberships.data.some((m) => m.publicUserData?.userId === user.id);
  console.log(`\n  → ${args.email} est-il membre de l'org ? ${isMember ? "OUI" : "NON"}`);

  console.log(`\n=== Invitations pour cet email ===`);
  const invitations = await clerk.invitations.getInvitationList({});
  const forEmail = invitations.data.filter((i) => i.emailAddress === args.email);
  for (const inv of forEmail) {
    console.log(`  • id=${inv.id} status=${inv.status} created=${new Date(inv.createdAt).toISOString()}`);
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
