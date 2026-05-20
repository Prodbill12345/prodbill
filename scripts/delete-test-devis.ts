/**
 * scripts/delete-test-devis.ts
 *
 * Script one-off pour supprimer le devis test 26-0027 ("TEST PERIODE",
 * BROUILLON, 0€) cree pendant le test du ticket #69.
 *
 * Garde-fous :
 *   1. Lecture seule par defaut (mode dry-run). Pour effacer reellement
 *      relancer avec --confirm.
 *   2. Cible UNIQUEMENT les devis qui matchent TOUTES ces conditions :
 *        - numero LIKE '%26-0027%' (tolerant si prefixe societe)
 *        - statut = BROUILLON
 *        - totalHt = 0
 *      Si plus d'une row match → on n'efface rien (ambigu, intervention
 *      manuelle requise).
 *
 * Usage :
 *   npx tsx scripts/delete-test-devis.ts             # dry-run
 *   npx tsx scripts/delete-test-devis.ts --confirm   # efface reellement
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

  const candidates = await prisma.devis.findMany({
    where: {
      numero: { contains: "26-0027" },
      statut: "BROUILLON",
      totalHt: 0,
    },
    include: {
      client: { select: { name: true } },
      company: { select: { name: true, prefixDevis: true } },
      sections: { select: { _count: { select: { lignes: true } } } },
      factures: { select: { id: true } },
    },
  });

  if (candidates.length === 0) {
    console.log(
      "Aucun devis ne correspond aux criteres (numero LIKE %26-0027% + BROUILLON + totalHt=0)."
    );
    console.log("Soit deja supprime, soit numero/statut/total ne match pas.");
    await prisma.$disconnect();
    return;
  }

  if (candidates.length > 1) {
    console.log(`\n⚠ ${candidates.length} devis matchent — refus de supprimer (ambigu) :\n`);
    for (const d of candidates) {
      console.log(
        `  - ${d.numero}  ${d.company.name}  client=${d.client.name}  objet="${d.objet}"`
      );
    }
    console.log("\nIntervention manuelle requise. Adapter le filtre du script.");
    await prisma.$disconnect();
    return;
  }

  const d = candidates[0];
  console.log("\nDevis cible :");
  console.log(`  Numero      : ${d.numero}`);
  console.log(`  Societe     : ${d.company.name} (prefix='${d.company.prefixDevis}')`);
  console.log(`  Client      : ${d.client.name}`);
  console.log(`  Objet       : ${d.objet}`);
  console.log(`  Statut      : ${d.statut}`);
  console.log(`  TotalHt     : ${d.totalHt} €`);
  console.log(`  Sections    : ${d.sections.length}`);
  console.log(`  Factures    : ${d.factures.length}`);
  console.log(`  bdcClientUrl: ${d.bdcClientUrl ?? "(aucun)"}`);
  console.log(`  CreatedAt   : ${d.createdAt.toISOString()}`);

  if (d.factures.length > 0) {
    console.log("\n⚠ Ce devis a des factures liees — refus de supprimer.");
    await prisma.$disconnect();
    return;
  }

  if (!CONFIRM) {
    console.log("\n[DRY-RUN] Relance avec --confirm pour effacer reellement.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nSuppression en cours...");
  // NB : cascade Prisma supprimera sections + lignes. Pas de blob BDC
  // ici (totalHt=0, devis test sans upload).
  await prisma.devis.delete({ where: { id: d.id } });
  console.log(`✓ Devis ${d.numero} supprime.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
