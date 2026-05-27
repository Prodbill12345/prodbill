/**
 * scripts/diag-factures-tva-cassee.ts
 *
 * Diag LECTURE SEULE pour identifier les factures émises avec la TVA
 * cassée par le bug #80 (NONNA) avant le fix.
 *
 * Cible : factures liées à un devis avec remise != 0 dont les totaux
 * (tva, totalTtc) divergent de ce que le helper computeFactureTotalsFromDevis()
 * aurait produit aujourd'hui.
 *
 * NE CORRIGE RIEN. Affiche la liste pour que Vanda puisse arbitrer manuellement
 * (re-émettre les factures impactées, faire un avoir, etc.).
 *
 * Usage : npx tsx scripts/diag-factures-tva-cassee.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { computeFactureTotalsFromDevis } from "../src/lib/invoice-totals";

const TOLERANCE = 0.02; // 2 centimes de marge d'arrondi acceptable

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  // Toutes les factures rattachées à un devis avec remise non nulle.
  const factures = await prisma.facture.findMany({
    where: {
      devisId: { not: null },
      devis: { remise: { gt: 0 } },
    },
    include: {
      company: { select: { name: true } },
      client: { select: { name: true } },
      devis: {
        select: {
          id: true,
          numero: true,
          totalHt: true,
          remise: true,
          coproduction: true,
          sousTotal: true,
          csComedien: true,
          csTechniciens: true,
          fraisGeneraux: true,
          marge: true,
          tauxTva: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    `\n${factures.length} facture(s) potentiellement impactée(s) (devis avec remise > 0).\n`
  );

  if (factures.length === 0) {
    console.log("✓ Aucun risque d'impact rétro.\n");
    await prisma.$disconnect();
    return;
  }

  let impactedCount = 0;
  let totalTvaSurfacturee = 0;

  for (const f of factures) {
    if (!f.devis) continue; // garde TS happy

    // Recalcule SOLDE pour simplifier — pour ACOMPTE/AVOIR, on a besoin du
    // pourcentage ou du contexte des acomptes précédents, qu'on n'a pas
    // ici. Pour cette première itération de diag, on signale aussi les
    // ACOMPTE/AVOIR mais on ne calcule l'écart précis que pour SOLDE.
    const recomputed =
      f.type === "SOLDE"
        ? computeFactureTotalsFromDevis({
            devis: f.devis,
            type: "SOLDE",
            // Acomptes existants pour ce devis (autres que la facture courante)
            acomptesTotalHt: 0, // simplification — voir note ci-dessus
          })
        : null;

    const tvaAttendue = recomputed?.tva ?? null;
    const ttcAttendu = recomputed?.totalTtc ?? null;
    const tvaEcart =
      tvaAttendue !== null ? round2(f.tva - tvaAttendue) : null;
    const ttcEcart =
      ttcAttendu !== null ? round2(f.totalTtc - ttcAttendu) : null;

    const isImpacted =
      tvaEcart !== null && Math.abs(tvaEcart) > TOLERANCE;

    if (isImpacted) {
      impactedCount += 1;
      totalTvaSurfacturee += tvaEcart!;
    }

    const flag = isImpacted ? "⚠ IMPACTÉE" : f.type !== "SOLDE" ? "? ACOMPTE/AVOIR" : "✓ OK";

    console.log(`─── ${f.numero}  ${flag}`);
    console.log(`  Société           : ${f.company.name}`);
    console.log(`  Client            : ${f.client.name}`);
    console.log(`  Type              : ${f.type}`);
    console.log(`  Devis source      : ${f.devis.numero} (remise ${f.devis.remise} €)`);
    console.log(`  totalHt stocké    : ${f.totalHt} €`);
    console.log(`  tva stocké        : ${f.tva} €`);
    console.log(`  totalTtc stocké   : ${f.totalTtc} €`);
    if (recomputed) {
      console.log(`  → tva attendue    : ${tvaAttendue} €  (écart ${tvaEcart})`);
      console.log(`  → totalTtc attendu: ${ttcAttendu} €  (écart ${ttcEcart})`);
    } else {
      console.log(`  (Recalcul ACOMPTE/AVOIR non automatisé — vérifier manuellement)`);
    }
    console.log(`  Émise le          : ${f.dateEmission?.toISOString().slice(0, 10) ?? "—"}`);
    console.log("");
  }

  console.log("═══ Résumé ═══");
  console.log(`  Factures SOLDE clairement impactées : ${impactedCount}`);
  console.log(
    `  Σ TVA surfacturée (factures SOLDE)  : ${round2(totalTvaSurfacturee)} €`
  );
  console.log("");
  console.log(
    "  Pour les factures EMISE, l'immutabilité légale (art. 289 CGI) interdit"
  );
  console.log(
    "  la modification du document. Régularisation possible via un AVOIR"
  );
  console.log("  + ré-émission. À arbitrer avec Vanda au cas par cas.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
