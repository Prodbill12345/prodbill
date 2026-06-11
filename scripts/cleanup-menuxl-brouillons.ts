/**
 * scripts/cleanup-menuxl-brouillons.ts
 *
 * Nettoyage cible des 2 brouillons facture MENUXL identifies par le
 * diag du 11/06 :
 *   - cmpo8s2te000104jl4fxcy89q  (DEV-2026-26002-S1, test Rose 27/05, OK)
 *   - cmpo7sncb000104jpipl1gsep  (F26002 chiffres casses, modif 08/06)
 *
 * Dry-run par defaut. --confirm pour executer.
 *
 * Garde-fous AVANT toute suppression :
 *   1. ID match exactement l'un des 2 ciblees
 *   2. Statut = BROUILLON (sinon refus — quelque chose a change)
 *   3. Client.name OU Company.name contient "NONNA" ou "MENUXL"
 *      (insensitive). Coverage du libelle "dossier NONNA/MENUXL".
 *
 * Si un seul garde-fou tombe sur l'une des 2 cibles, AUCUNE des deux
 * n'est supprimee. On affiche l'ecart et on attend une nouvelle
 * decision manuelle de Rose.
 *
 * Usage :
 *   npx tsx scripts/cleanup-menuxl-brouillons.ts             # dry-run
 *   npx tsx scripts/cleanup-menuxl-brouillons.ts --confirm   # execute
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const TARGET_IDS = [
  "cmpo8s2te000104jl4fxcy89q",
  "cmpo7sncb000104jpipl1gsep",
] as const;

const CONFIRM = process.argv.includes("--confirm");

function isNonnaOrMenuxl(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes("nonna") || lower.includes("menuxl");
}

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  console.log(`\nCibles : ${TARGET_IDS.length} brouillon(s) facture\n`);

  const factures = await prisma.facture.findMany({
    where: { id: { in: [...TARGET_IDS] } },
    include: {
      company: { select: { name: true } },
      client: { select: { name: true } },
      devis: { select: { numero: true, objet: true } },
    },
  });

  // Garde-fou 1 : ils sont bien tous trouves
  if (factures.length !== TARGET_IDS.length) {
    const found = new Set(factures.map((f) => f.id));
    const missing = TARGET_IDS.filter((id) => !found.has(id));
    console.log(`⚠ ${missing.length} cible(s) introuvable(s) en DB :`);
    for (const id of missing) console.log(`  - ${id}`);
    console.log("\nAbandon. Verifier que les IDs n'ont pas deja ete supprimes,");
    console.log("ou qu'ils n'ont pas ete deplaces. Aucune suppression effectuee.\n");
    await prisma.$disconnect();
    return;
  }

  // Garde-fous 2 et 3 : chaque facture passe le check
  const refusals: string[] = [];
  for (const f of factures) {
    if (f.statut !== "BROUILLON") {
      refusals.push(
        `  - ${f.id} : statut=${f.statut} (attendu BROUILLON). REFUS.`
      );
    }
    const nonna = isNonnaOrMenuxl(f.client.name) || isNonnaOrMenuxl(f.company.name);
    if (!nonna) {
      refusals.push(
        `  - ${f.id} : client="${f.client.name}" company="${f.company.name}" — pas de match NONNA/MENUXL. REFUS.`
      );
    }
  }

  console.log("Detail des cibles :\n");
  for (const f of factures) {
    console.log(`─── ${f.id}`);
    console.log(`  Numero      : ${f.numero}`);
    console.log(`  Type        : ${f.type}`);
    console.log(`  Statut      : ${f.statut}`);
    console.log(`  Company     : ${f.company.name}`);
    console.log(`  Client      : ${f.client.name}`);
    console.log(`  Devis source: ${f.devis?.numero ?? "(orphelin)"} — ${f.devis?.objet ?? ""}`);
    console.log(`  totalHt/tva/ttc : ${f.totalHt} / ${f.tva} / ${f.totalTtc} €`);
    console.log(`  createdAt   : ${f.createdAt.toISOString()}`);
    console.log(`  updatedAt   : ${f.updatedAt.toISOString()}`);
    console.log("");
  }

  if (refusals.length > 0) {
    console.log("⚠ Garde-fous declenches — AUCUNE suppression :");
    for (const r of refusals) console.log(r);
    console.log(
      "\nVerifier l'etat actuel des cibles avant de relancer. Aucune modification DB.\n"
    );
    await prisma.$disconnect();
    return;
  }

  if (!CONFIRM) {
    console.log("[DRY-RUN] Les 2 cibles passent tous les garde-fous.");
    console.log("Relance avec --confirm pour supprimer reellement.\n");
    await prisma.$disconnect();
    return;
  }

  console.log("Suppression en cours...");
  let deleted = 0;
  for (const f of factures) {
    await prisma.facture.delete({ where: { id: f.id } });
    deleted += 1;
    console.log(`  ✓ ${f.id}  (${f.numero})`);
  }
  console.log(`\n${deleted} brouillon(s) supprime(s).\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
