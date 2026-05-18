/**
 * scripts/diag-outliers-tva.ts
 *
 * Diag LECTURE SEULE des devis Caleson avec un tauxTva non standard
 * (différent de 0, 5.5, 10, 20). Détecté lors du diag du FIX 2 :
 * 2 devis Caleson à 16.67% et 26.67%, vraisemblablement des artefacts
 * d'import historique.
 *
 * Pour chacun : numéro, client, objet, totalApresRemise, tva stocké,
 * totalTtc stocké, ratio tva/net réel, facture(s) associée(s).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const STANDARD_TAUX = [0, 5.5, 10, 20];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Tous les devis avec tauxTva non standard, toutes companies
  const all = await prisma.devis.findMany({
    where: { tauxTva: { notIn: STANDARD_TAUX } },
    include: {
      company: { select: { name: true } },
      client: { select: { name: true } },
      factures: { select: { numero: true, statut: true, type: true, tauxTva: true } },
    },
    orderBy: [{ companyId: "asc" }, { numero: "asc" }],
  });

  console.log(`\n${all.length} devis avec tauxTva non standard (≠ 0/5.5/10/20) :\n`);

  for (const d of all) {
    const ratioReel = d.totalApresRemise > 0
      ? Math.round((d.tva / d.totalApresRemise) * 10000) / 100
      : 0;
    const expectedTtc = Math.round((d.totalApresRemise + d.tva) * 100) / 100;
    const ttcCoherent = Math.abs(expectedTtc - d.totalTtc) < 0.02;

    console.log(`─── ${d.numero ?? `(brouillon-${d.id.slice(0, 8)})`}  ${d.company.name}  ${d.statut} ───`);
    console.log(`  Client            : ${d.client.name}`);
    console.log(`  Objet             : ${d.objet}`);
    console.log(`  tauxTva stocké    : ${d.tauxTva} %`);
    console.log(`  totalApresRemise  : ${d.totalApresRemise} €`);
    console.log(`  tva stocké        : ${d.tva} €  (ratio réel = ${ratioReel} % du net)`);
    console.log(`  totalTtc stocké   : ${d.totalTtc} €  ${ttcCoherent ? "✓" : `⚠ attendu ${expectedTtc}`}`);
    console.log(`  Factures liées    : ${d.factures.length}`);
    for (const f of d.factures) {
      console.log(`    • ${f.numero}  ${f.statut} ${f.type}  tauxTva=${f.tauxTva}%`);
    }
    console.log();
  }

  // Stats factures avec tauxTva non standard
  const factOutliers = await prisma.facture.findMany({
    where: { tauxTva: { notIn: STANDARD_TAUX } },
    include: {
      company: { select: { name: true } },
      client: { select: { name: true } },
    },
  });
  if (factOutliers.length > 0) {
    console.log(`\n${factOutliers.length} factures avec tauxTva non standard :`);
    for (const f of factOutliers) {
      console.log(`  ${f.numero}  ${f.company.name}  ${f.statut} ${f.type}  tauxTva=${f.tauxTva}%  client=${f.client.name}`);
    }
  }

  await prisma.$disconnect();
}

main()
  .catch((err) => {
    console.error("Erreur :", err);
    process.exitCode = 1;
  });
