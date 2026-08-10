/**
 * scripts/migrate-legacy-facture-drafts.ts
 *
 * Ticket #98 — migration de données des 2 brouillons facture legacy, à lancer
 * APRÈS déploiement du code null-safe et de la migration schéma
 * (facture_numero_nullable). Rose en 4G.
 *
 * Fait, dans une transaction atomique :
 *   1. Vide le numéro (numero = NULL) des brouillons facture ayant encore un
 *      numéro legacy dérivé du devis ("26011-S1" NONNA, "26031-S1" Caleson).
 *      Ces brouillons prendront un numéro propre à l'émission.
 *   2. Reset le Counter FACTURE pour une reprise en séquence contiguë :
 *        - NONNA Post-Production → 4  (prochaine émission = F26005)
 *        - Caleson              → 0  (prochaine émission = F26001)
 *
 * Garde-fous (DRY-RUN par défaut, --confirm pour exécuter) :
 *   - Whitelist stricte des 2 companyId (résolus par name, assert = 2).
 *   - Cible = brouillons avec numero NON NULL dans ces 2 sociétés. Les
 *     nouveaux brouillons (numero déjà NULL depuis #98) sont ignorés.
 *   - Assert EXACTEMENT 2 brouillons ciblés, sinon abandon.
 *   - Assert AUCUNE facture emiseAt non-null n'est touchée (protège les 4
 *     émises NONNA 26001-26004).
 *
 * Usage :
 *   npx tsx scripts/migrate-legacy-facture-drafts.ts             # dry-run
 *   npx tsx scripts/migrate-legacy-facture-drafts.ts --confirm   # exécute
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const CONFIRM = process.argv.includes("--confirm");

// Année civile des compteurs à resetter (les factures 2026).
const COUNTER_YEAR = 2026;

// Config par société : nom exact + valeur cible du Counter FACTURE.
const TARGETS = [
  { name: "Caleson", factureCounter: 0 }, // prochaine émission → F26001
  { name: "NONNA Post-Production", factureCounter: 4 }, // → F26005
] as const;

const EXPECTED_DRAFTS = 2;

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log("\nProdBill — Migration brouillons facture legacy (#98)");
  console.log("════════════════════════════════════════════════════");
  console.log(CONFIRM ? "Mode : ⚠ EXÉCUTION (--confirm)\n" : "Mode : DRY-RUN (lecture seule)\n");

  // ── Résolution stricte des companyId ────────────────────────────────────
  const names = TARGETS.map((t) => t.name);
  const companies = await prisma.company.findMany({
    where: { name: { in: [...names] } },
    select: { id: true, name: true },
  });

  if (companies.length !== TARGETS.length) {
    console.error(
      `✗ Attendu ${TARGETS.length} companies (${names.join(", ")}), trouvé ${companies.length}. Abandon.`
    );
    const all = await prisma.company.findMany({ select: { id: true, name: true } });
    for (const c of all) console.error(`    - "${c.name}" (${c.id})`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const idByName = new Map(companies.map((c) => [c.name, c.id]));
  const companyIds = companies.map((c) => c.id);

  // ── Cible : brouillons avec numéro legacy (non null) dans ces 2 sociétés ──
  const drafts = await prisma.facture.findMany({
    where: {
      companyId: { in: companyIds },
      statut: "BROUILLON",
      numero: { not: null },
    },
    select: {
      id: true,
      numero: true,
      statut: true,
      emiseAt: true,
      company: { select: { name: true } },
    },
  });

  console.log("Brouillons facture legacy ciblés (numero → NULL) :");
  for (const d of drafts) {
    console.log(
      `  - ${d.company.name} : "${d.numero}"  (id ${d.id}, emiseAt=${d.emiseAt ? d.emiseAt.toISOString() : "null"})`
    );
  }
  console.log("");

  // ── Garde-fous ──────────────────────────────────────────────────────────
  if (drafts.length !== EXPECTED_DRAFTS) {
    console.error(
      `✗ Attendu EXACTEMENT ${EXPECTED_DRAFTS} brouillons legacy, trouvé ${drafts.length}. Abandon (aucune modif).`
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  const withEmiseAt = drafts.filter((d) => d.emiseAt !== null);
  if (withEmiseAt.length > 0) {
    console.error(
      `✗ ${withEmiseAt.length} cible(s) ont emiseAt non-null — ce ne sont pas des brouillons. Abandon.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // Reset compteurs prévu
  console.log("Reset Counter FACTURE prévu :");
  for (const t of TARGETS) {
    const cid = idByName.get(t.name)!;
    const current = await prisma.counter.findUnique({
      where: { companyId_year_type: { companyId: cid, year: COUNTER_YEAR, type: "FACTURE" } },
      select: { value: true },
    });
    console.log(
      `  - ${t.name} ${COUNTER_YEAR} FACTURE : ${current?.value ?? "(absent)"} → ${t.factureCounter}  (prochaine émission F${String(COUNTER_YEAR).slice(-2)}${String(t.factureCounter + 1).padStart(3, "0")})`
    );
  }
  console.log("");

  if (!CONFIRM) {
    console.log("[DRY-RUN] Rien modifié. Relance avec --confirm pour exécuter.\n");
    await prisma.$disconnect();
    return;
  }

  // ── EXÉCUTION atomique ──────────────────────────────────────────────────
  const draftIds = drafts.map((d) => d.id);
  const result = await prisma.$transaction(async (tx) => {
    // 1. Vider les numéros des brouillons legacy (garde-fou statut re-vérifié).
    const cleared = await tx.facture.updateMany({
      where: { id: { in: draftIds }, statut: "BROUILLON", emiseAt: null },
      data: { numero: null },
    });

    // 2. Reset des compteurs FACTURE, valeur par société (upsert au cas où
    //    la ligne Counter n'existe pas encore).
    for (const t of TARGETS) {
      const cid = idByName.get(t.name)!;
      await tx.counter.upsert({
        where: { companyId_year_type: { companyId: cid, year: COUNTER_YEAR, type: "FACTURE" } },
        update: { value: t.factureCounter },
        create: { companyId: cid, year: COUNTER_YEAR, type: "FACTURE", value: t.factureCounter },
      });
    }

    return { cleared: cleared.count };
  });

  console.log(`✓ ${result.cleared} brouillon(s) : numéro vidé (→ NULL).`);
  console.log("✓ Compteurs FACTURE resettés (NONNA→4, Caleson→0).");
  console.log("\nVanda peut émettre : prochaine facture NONNA = F26005, Caleson = F26001.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
