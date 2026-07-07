/**
 * scripts/reset-counter-caleson-nonna.ts
 *
 * Ticket #95 — Remet la numérotation à zéro sur Caleson ET NONNA après le
 * wipe de l'historique, pour que Vanda reparte de D26001 / F26001 / BDC…
 *
 * ┌─ CE QUE LE SCRIPT FAIT (scopé companyId ∈ {Caleson, NONNA}) ─────────┐
 * │  1. Counter.value = 0 pour les 3 types (DEVIS, FACTURE, BDC), tous   │
 * │     millésimes confondus → le prochain numéro généré sera 1.         │
 * │  2. Vide prefixDevis / prefixFacture des 2 companies → le format      │
 * │     unifié "YY"+3 chiffres ("26001") s'applique aux deux (voir        │
 * │     src/lib/numbering.ts).                                            │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Garde-fous (identiques au wipe) :
 *   - DRY-RUN par défaut. --confirm requis pour écrire.
 *   - Résout les companyId par name, EXIGE exactement 2 résultats, sinon
 *     abandon (aucun autre workspace ne peut être touché — whitelist d'IDs).
 *   - Transaction Prisma atomique.
 *
 * Prérequis : à lancer APRÈS le wipe de l'historique (sinon on créerait des
 * doublons de numéros avec les pièces existantes). Rose le lance avant que
 * Vanda ne reprenne la saisie.
 *
 * Usage :
 *   npx tsx scripts/reset-counter-caleson-nonna.ts             # dry-run
 *   npx tsx scripts/reset-counter-caleson-nonna.ts --confirm   # exécute
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const CONFIRM = process.argv.includes("--confirm");

const TARGET_COMPANY_NAMES = ["Caleson", "NONNA Post-Production"] as const;

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log("\nProdBill — Reset numérotation Caleson + NONNA (#95)");
  console.log("═══════════════════════════════════════════════════");
  console.log(CONFIRM ? "Mode : ⚠ EXÉCUTION (--confirm)\n" : "Mode : DRY-RUN (lecture seule)\n");

  // ── Résolution stricte des companyId ────────────────────────────────────
  const targets = await prisma.company.findMany({
    where: { name: { in: [...TARGET_COMPANY_NAMES] } },
    select: { id: true, name: true, prefixDevis: true, prefixFacture: true },
  });

  if (targets.length !== 2) {
    console.error(
      `✗ Attendu 2 companies (${TARGET_COMPANY_NAMES.join(", ")}), trouvé ${targets.length}.`
    );
    const all = await prisma.company.findMany({ select: { id: true, name: true } });
    console.error("  Companies en DB :");
    for (const c of all) console.error(`    - "${c.name}" (${c.id})`);
    console.error("\n  Abandon. Aucune modification.\n");
    await prisma.$disconnect();
    process.exit(1);
  }

  const companyIds = targets.map((c) => c.id);

  // ── État courant (dry-run + récap) ──────────────────────────────────────
  console.log("État courant :\n");
  for (const c of targets) {
    const counters = await prisma.counter.findMany({
      where: { companyId: c.id },
      select: { year: true, type: true, value: true },
      orderBy: [{ year: "asc" }, { type: "asc" }],
    });
    console.log(`  ── ${c.name} (${c.id})`);
    console.log(`     prefixDevis   : ${JSON.stringify(c.prefixDevis)}`);
    console.log(`     prefixFacture : ${JSON.stringify(c.prefixFacture)}`);
    if (counters.length === 0) {
      console.log("     (aucun compteur)");
    } else {
      for (const ct of counters) {
        console.log(`     Counter ${ct.year} ${ct.type} = ${ct.value}  →  0`);
      }
    }
    console.log("");
  }

  console.log("Après reset, le prochain numéro généré (value 1) donnera :");
  console.log('  Devis   → "26001"   (affiché "D26001 - objet")');
  console.log('  Facture → "26001-A1" / "26001-S1"');
  console.log('  BDC     → "BDC-26001"\n');

  if (!CONFIRM) {
    console.log("[DRY-RUN] Rien n'a été modifié. Relance avec --confirm pour exécuter.\n");
    await prisma.$disconnect();
    return;
  }

  // ── EXÉCUTION : transaction atomique ────────────────────────────────────
  console.log("⚠ Reset en cours (transaction atomique)...\n");

  const result = await prisma.$transaction(async (tx) => {
    const counters = await tx.counter.updateMany({
      where: { companyId: { in: companyIds }, type: { in: ["DEVIS", "FACTURE", "BDC"] } },
      data: { value: 0 },
    });
    const prefixes = await tx.company.updateMany({
      where: { id: { in: companyIds } },
      data: { prefixDevis: "", prefixFacture: "" },
    });
    return { counters: counters.count, prefixes: prefixes.count };
  });

  console.log(`✓ ${result.counters} compteur(s) remis à 0.`);
  console.log(`✓ ${result.prefixes} company(ies) : préfixes devis/facture vidés.`);
  console.log("\nVanda peut reprendre : le prochain devis sera D26001.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
