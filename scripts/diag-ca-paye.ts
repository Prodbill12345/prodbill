/**
 * Diag CA paye : pourquoi Caleson affiche "—" alors qu'il y a beaucoup
 * de factures PAYEE ?
 *
 * Verifie pour chaque Company :
 *  - Nb factures par statut
 *  - Sum totalTtc par statut
 *  - Sum Paiement.montant
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  for (const c of companies) {
    console.log(`\n=== ${c.name} (${c.id}) ===`);

    const byStatut = await prisma.facture.groupBy({
      by: ["statut"],
      where: { companyId: c.id },
      _count: { _all: true },
      _sum: { totalTtc: true },
    });
    console.log("  Factures par statut :");
    for (const row of byStatut) {
      console.log(
        `    ${row.statut.padEnd(20)} ${String(row._count._all).padStart(4)} factures, Σ totalTtc = ${Number(row._sum.totalTtc ?? 0).toFixed(2)} €`
      );
    }

    const paiementSum = await prisma.paiement.aggregate({
      where: { companyId: c.id },
      _count: { _all: true },
      _sum: { montant: true },
    });
    console.log(
      `  Paiements         : ${paiementSum._count._all} rows, Σ montant = ${Number(paiementSum._sum.montant ?? 0).toFixed(2)} €`
    );
  }
}

main()
  .catch((err) => {
    console.error("Erreur :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
