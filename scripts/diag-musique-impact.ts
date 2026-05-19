/**
 * scripts/diag-musique-impact.ts
 *
 * Diag LECTURE SEULE pour évaluer l'impact financier de l'exclusion
 * des lignes MUSIQUE du calcul Marge / Frais Généraux (tickets
 * #66 #67 #68 — Vanda).
 *
 * À lancer AVANT toute décision de backfill horsMarge.
 *
 * Sort :
 *   1. Distribution globale des tags (toutes companies)
 *   2. Top 10 devis Caleson avec lignes MUSIQUE :
 *      - numéro, client, objet, statut
 *      - sousTotal HT, total des lignes MUSIQUE
 *      - marge actuelle (stockée), marge hypothétique si MUSIQUE exclue
 *      - delta € (économie pour le client si on excluait)
 *   3. Total cumulé sur tous les devis Caleson concernés (estimation)
 *
 * Ne modifie rien en DB.
 *
 * Usage : npx tsx scripts/diag-musique-impact.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // ── 1. Distribution globale des tags ──────────────────────────────────────
  console.log("\n═══ Distribution globale des tags de lignes ═══\n");
  const distribution = await prisma.devisLigne.groupBy({
    by: ["tag"],
    _count: { tag: true },
    _sum: { total: true },
  });
  for (const row of distribution.sort((a, b) => b._count.tag - a._count.tag)) {
    console.log(
      `  ${row.tag.padEnd(20)} ${String(row._count.tag).padStart(6)} lignes` +
        `   Σ total = ${(row._sum.total ?? 0).toFixed(2).padStart(12)} €`
    );
  }

  // ── 2. Devis Caleson avec lignes MUSIQUE ──────────────────────────────────
  // Caleson est identifié par le nom de la company (peut nécessiter ajustement
  // si le nom exact diffère en prod).
  const caleson = await prisma.company.findFirst({
    where: { name: { contains: "Caleson", mode: "insensitive" } },
    select: { id: true, name: true },
  });

  if (!caleson) {
    console.log("\n⚠ Pas de company 'Caleson' trouvée. Sortie.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n═══ Devis ${caleson.name} avec lignes MUSIQUE ═══\n`);

  const devisAvecMusique = await prisma.devis.findMany({
    where: {
      companyId: caleson.id,
      sections: {
        some: { lignes: { some: { tag: "MUSIQUE" } } },
      },
    },
    include: {
      client: { select: { name: true } },
      sections: {
        include: {
          lignes: { select: { tag: true, total: true, tauxIndexation: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`  ${devisAvecMusique.length} devis Caleson avec au moins 1 ligne MUSIQUE\n`);

  let cumulDeltaMarge = 0;
  let cumulDeltaFg = 0;

  for (const d of devisAvecMusique.slice(0, 15)) {
    const allLignes = d.sections.flatMap((s) => s.lignes);
    const musiqueLignes = allLignes.filter((l) => l.tag === "MUSIQUE");
    const musiqueTotal = round2(
      musiqueLignes.reduce(
        (s, l) => s + l.total + l.total * ((l.tauxIndexation ?? 0) / 100),
        0
      )
    );

    // Hypothèse : si on excluait les MUSIQUE du baseMarge actuel,
    // le baseMarge serait réduit du montant des lignes MUSIQUE
    // (et de leur indexation). La part csTech reste inchangée
    // (MUSIQUE n'a pas de CS Tech). Donc :
    //   baseMarge_new = baseMarge - musiqueTotal
    //   marge_new     = baseMarge_new × tauxMarge
    //   fg_new        = baseMarge_new × tauxFg
    const baseMargeNew = d.baseMarge - musiqueTotal;
    const margeNew = round2(baseMargeNew * d.tauxMarge);
    const fgNew = round2(baseMargeNew * d.tauxFg);

    const deltaMarge = round2(d.marge - margeNew);
    const deltaFg = round2(d.fraisGeneraux - fgNew);
    cumulDeltaMarge += deltaMarge;
    cumulDeltaFg += deltaFg;

    console.log(
      `─── ${d.numero ?? `(brouillon-${d.id.slice(0, 8)})`}  ${d.statut}`
    );
    console.log(`  Client            : ${d.client.name}`);
    console.log(`  Objet             : ${d.objet}`);
    console.log(`  Σ MUSIQUE         : ${musiqueTotal.toFixed(2).padStart(10)} €  (${musiqueLignes.length} ligne(s))`);
    console.log(`  sousTotal HT      : ${d.sousTotal.toFixed(2).padStart(10)} €`);
    console.log(
      `  Marge actuelle    : ${d.marge.toFixed(2).padStart(10)} €  →  si MUSIQUE exclue : ${margeNew.toFixed(2)} €  (Δ ${deltaMarge.toFixed(2)} €)`
    );
    console.log(
      `  FG actuel         : ${d.fraisGeneraux.toFixed(2).padStart(10)} €  →  si MUSIQUE exclue : ${fgNew.toFixed(2)} €  (Δ ${deltaFg.toFixed(2)} €)`
    );
    console.log();
  }

  if (devisAvecMusique.length > 15) {
    console.log(`  ... ${devisAvecMusique.length - 15} autres devis non détaillés.\n`);
  }

  console.log("═══ Cumul sur les devis détaillés ci-dessus ═══");
  console.log(`  Δ Marge cumulé    : ${cumulDeltaMarge.toFixed(2)} €`);
  console.log(`  Δ FG cumulé       : ${cumulDeltaFg.toFixed(2)} €`);
  console.log(`  Total surfacturé  : ${(cumulDeltaMarge + cumulDeltaFg).toFixed(2)} € HT`);
  console.log(
    `\n  (Estimation pour info — basée sur les taux et la baseMarge actuels.`
  );
  console.log(
    `   Le backfill n'est PAS recommandé sur devis déjà émis : préserve l'historique.)\n`
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
