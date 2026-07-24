/**
 * scripts/set-nonna-hide-tva-devis.ts
 *
 * Configure NONNA Post-Production avec hideTvaTtcOnDevis = true : ses DEVIS
 * n'affichent plus la TVA ni le Total TTC (pur affichage). Les FACTURES et
 * les autres workspaces ne sont pas touchés.
 *
 * Garde-fous :
 *   - DRY-RUN par défaut. --confirm requis pour écrire.
 *   - Cible UNIQUEMENT "NONNA Post-Production" (résolu par name). Abandon si
 *     ≠ exactement 1 company trouvée.
 *
 * Usage :
 *   npx tsx scripts/set-nonna-hide-tva-devis.ts             # dry-run
 *   npx tsx scripts/set-nonna-hide-tva-devis.ts --confirm   # exécute
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const CONFIRM = process.argv.includes("--confirm");
const TARGET_NAME = "NONNA Post-Production";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log("\nProdBill — NONNA hideTvaTtcOnDevis = true");
  console.log("═════════════════════════════════════════");
  console.log(CONFIRM ? "Mode : ⚠ EXÉCUTION (--confirm)\n" : "Mode : DRY-RUN (lecture seule)\n");

  const targets = await prisma.company.findMany({
    where: { name: TARGET_NAME },
    select: { id: true, name: true, hideTvaTtcOnDevis: true },
  });

  if (targets.length !== 1) {
    console.error(`✗ Attendu 1 company "${TARGET_NAME}", trouvé ${targets.length}. Abandon.`);
    const all = await prisma.company.findMany({ select: { id: true, name: true } });
    for (const c of all) console.error(`    - "${c.name}" (${c.id})`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const nonna = targets[0];
  console.log(`Cible : ${nonna.name} (${nonna.id})`);
  console.log(`  hideTvaTtcOnDevis : ${nonna.hideTvaTtcOnDevis}  →  true\n`);

  if (nonna.hideTvaTtcOnDevis === true) {
    console.log("Déjà à true — rien à faire.\n");
    await prisma.$disconnect();
    return;
  }

  if (!CONFIRM) {
    console.log("[DRY-RUN] Rien modifié. Relance avec --confirm pour exécuter.\n");
    await prisma.$disconnect();
    return;
  }

  await prisma.company.update({
    where: { id: nonna.id },
    data: { hideTvaTtcOnDevis: true },
  });

  console.log("✓ NONNA configurée : TVA + TTC masqués sur ses devis.\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
