/**
 * scripts/audit-devis-totalht.ts
 *
 * Audit lecture seule : recense tous les devis dont le totalHt stocke
 * ne correspond pas a la somme des composantes (sousTotal + csComedien
 * + csTechniciens + fraisGeneraux + marge).
 *
 * Tolerance 0,02 € pour absorber les arrondis flottants.
 *
 * Affiche : resume global + par workspace + par statut + par devis
 * (avec mention "FACTURE" si une facture a deja ete emise depuis).
 *
 * Aucune ecriture. Pour reparer, voir scripts/repair-devis-totalht.ts.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EPSILON = 0.02;

interface Mismatch {
  id: string;
  companyName: string;
  companyId: string;
  numero: string | null;
  objet: string;
  statut: string;
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  fraisGeneraux: number;
  marge: number;
  expectedTotalHt: number;
  storedTotalHt: number;
  delta: number;
  remise: number;
  coproduction: number;
  totalApresRemise: number;
  tva: number;
  totalTtc: number;
  nbFactures: number;
  updatedAt: Date;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log("\nAudit totalHt sur tous les devis…\n");

  const allDevis = await prisma.devis.findMany({
    include: {
      company: { select: { id: true, name: true } },
      _count: { select: { factures: true } },
    },
    orderBy: [{ companyId: "asc" }, { numero: "asc" }],
  });

  console.log(`Total devis examines : ${allDevis.length}\n`);

  const mismatches: Mismatch[] = [];

  for (const d of allDevis) {
    const expected = r2(
      d.sousTotal + d.csComedien + d.csTechniciens + d.fraisGeneraux + d.marge
    );
    const delta = r2(d.totalHt - expected);
    if (Math.abs(delta) > EPSILON) {
      mismatches.push({
        id: d.id,
        companyName: d.company.name,
        companyId: d.companyId,
        numero: d.numero,
        objet: d.objet,
        statut: d.statut,
        sousTotal: d.sousTotal,
        csComedien: d.csComedien,
        csTechniciens: d.csTechniciens,
        fraisGeneraux: d.fraisGeneraux,
        marge: d.marge,
        expectedTotalHt: expected,
        storedTotalHt: d.totalHt,
        delta,
        remise: d.remise,
        coproduction: d.coproduction,
        totalApresRemise: d.totalApresRemise,
        tva: d.tva,
        totalTtc: d.totalTtc,
        nbFactures: d._count.factures,
        updatedAt: d.updatedAt,
      });
    }
  }

  // ─── Resume ──────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════");
  console.log(`RESUME : ${mismatches.length} devis corrompus / ${allDevis.length} total`);
  console.log("═══════════════════════════════════════════════\n");

  const byCompany = new Map<string, Mismatch[]>();
  const byStatut = new Map<string, number>();
  let withFactureCount = 0;
  for (const m of mismatches) {
    if (!byCompany.has(m.companyName)) byCompany.set(m.companyName, []);
    byCompany.get(m.companyName)!.push(m);
    byStatut.set(m.statut, (byStatut.get(m.statut) ?? 0) + 1);
    if (m.nbFactures > 0) withFactureCount++;
  }

  console.log("Par workspace :");
  for (const [name, list] of byCompany) {
    console.log(`  ${name.padEnd(25)} ${String(list.length).padStart(4)} devis`);
  }
  console.log();

  console.log("Par statut :");
  for (const [statut, count] of byStatut) {
    console.log(`  ${statut.padEnd(20)} ${String(count).padStart(4)} devis`);
  }
  console.log();

  console.log(
    `Devis deja emis en facture : ${withFactureCount} / ${mismatches.length}`
  );
  console.log(
    `Devis sans facture          : ${mismatches.length - withFactureCount} / ${mismatches.length}`
  );

  // ─── Detail ──────────────────────────────────────────────────────────────
  if (mismatches.length === 0) {
    console.log("\n✓ Aucun devis corrompu. RAS.");
    return;
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("DETAIL");
  console.log("═══════════════════════════════════════════════\n");

  for (const [name, list] of byCompany) {
    console.log(`─── ${name} (${list.length} devis) ───`);
    for (const m of list) {
      const numero = m.numero ?? `(brouillon ${m.id.slice(0, 8)})`;
      const fact = m.nbFactures > 0 ? ` [FACTURE x${m.nbFactures}]` : "";
      console.log(
        `\n  • ${numero}  ${m.statut.padEnd(10)}  ${m.objet.slice(0, 70)}${fact}`
      );
      console.log(
        `    composantes : sousTotal ${m.sousTotal.toFixed(2)} + csCom ${m.csComedien.toFixed(2)} + csTech ${m.csTechniciens.toFixed(2)} + FG ${m.fraisGeneraux.toFixed(2)} + marge ${m.marge.toFixed(2)}`
      );
      console.log(
        `    expected totalHt = ${m.expectedTotalHt.toFixed(2)} €  |  stored = ${m.storedTotalHt.toFixed(2)} €  |  delta = ${m.delta > 0 ? "+" : ""}${m.delta.toFixed(2)} €`
      );
      console.log(
        `    remise ${m.remise.toFixed(2)}  coprod ${m.coproduction.toFixed(2)}  apresRemise ${m.totalApresRemise.toFixed(2)}  tva ${m.tva.toFixed(2)}  ttc ${m.totalTtc.toFixed(2)}`
      );
      // Diagnostic pattern : totalHt stocke est-il en fait totalApresRemise ?
      if (Math.abs(m.storedTotalHt - m.totalApresRemise) <= EPSILON) {
        console.log(
          `    pattern : storedTotalHt === totalApresRemise → bug import (totalHt ecrase par le net)`
        );
      } else {
        console.log(`    pattern : ATYPIQUE — ne match pas totalApresRemise`);
      }
    }
    console.log();
  }
}

main()
  .catch((err) => {
    console.error("Erreur :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
