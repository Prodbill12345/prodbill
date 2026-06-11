/**
 * scripts/diag-menuxl-brouillon.ts
 *
 * Diag LECTURE SEULE pour identifier les brouillons de facture liés au
 * dossier MENUXL (devis D26002 ou similaire). Etat douteux laisse par
 * Rose le 27/05 avant son depart en vacances.
 *
 * Filtre large pour ne rien manquer :
 *   - facture.statut = BROUILLON
 *   ET (devis.numero contient "26002"
 *       OU client.name contient "MENUXL" (case insensitive)
 *       OU devis.objet contient "MENUXL" (case insensitive))
 *
 * NE MODIFIE RIEN. Affiche la liste pour decision manuelle.
 *
 * Usage : npx tsx scripts/diag-menuxl-brouillon.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const factures = await prisma.facture.findMany({
    where: {
      statut: "BROUILLON",
      OR: [
        { devis: { numero: { contains: "26002" } } },
        { client: { name: { contains: "MENUXL", mode: "insensitive" } } },
        { devis: { objet: { contains: "MENUXL", mode: "insensitive" } } },
      ],
    },
    include: {
      company: { select: { name: true } },
      client: { select: { name: true, email: true } },
      devis: {
        select: {
          id: true,
          numero: true,
          objet: true,
          statut: true,
          totalHt: true,
          remise: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n${factures.length} brouillon(s) facture trouve(s) pour MENUXL.\n`);

  if (factures.length === 0) {
    console.log("✓ Rien a nettoyer.\n");
    await prisma.$disconnect();
    return;
  }

  for (const f of factures) {
    console.log(`─── Facture ${f.numero || "(sans numero)"}  [BROUILLON]`);
    console.log(`  id            : ${f.id}`);
    console.log(`  Societe       : ${f.company.name}`);
    console.log(`  Client        : ${f.client.name} <${f.client.email}>`);
    console.log(`  Type          : ${f.type}`);
    console.log(`  totalHt       : ${f.totalHt} €`);
    console.log(`  tva / totalTtc: ${f.tva} € / ${f.totalTtc} €`);
    console.log(`  Devis source  : ${f.devis?.numero ?? "(orphelin)"} — ${f.devis?.objet ?? ""}`);
    console.log(`  Devis statut  : ${f.devis?.statut ?? "—"}`);
    console.log(`  Devis remise  : ${f.devis?.remise ?? 0} €  ← important pour bug TVA #80`);
    console.log(`  createdAt     : ${f.createdAt.toISOString()}`);
    console.log(`  updatedAt     : ${f.updatedAt.toISOString()}`);
    console.log("");
  }

  console.log("Actions possibles a discuter avec Rose :");
  console.log("  1. Supprimer le(s) brouillon(s) (DELETE Facture autorise sur BROUILLON)");
  console.log("  2. Le(s) emettre apres verification (route /api/factures/[id]/emettre)");
  console.log("  3. Le(s) laisser tel quel si en cours de validation\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
