/**
 * scripts/audit-devis-totalht-csv.ts
 *
 * Identique a audit-devis-totalht.ts mais emet un CSV exhaustif des
 * 56 devis corrompus avec client + statut(s) facture(s).
 *
 * Tolerance > 0.02 € pour exclure les artefacts de rounding flottant.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EPSILON = 0.02;

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function csvEscape(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const allDevis = await prisma.devis.findMany({
    include: {
      company: { select: { name: true } },
      client: { select: { name: true } },
      factures: { select: { numero: true, statut: true, type: true } },
    },
    orderBy: [{ companyId: "asc" }, { numero: "asc" }],
  });

  // Header CSV
  console.log(
    [
      "numero",
      "workspace",
      "statut_devis",
      "delta_eur",
      "stored_totalHt",
      "expected_totalHt",
      "remise",
      "client",
      "objet",
      "nb_factures",
      "factures_numeros",
      "factures_statuts",
      "categorie",
    ].join(",")
  );

  for (const d of allDevis) {
    const expected = r2(
      d.sousTotal + d.csComedien + d.csTechniciens + d.fraisGeneraux + d.marge
    );
    const delta = r2(d.totalHt - expected);
    if (Math.abs(delta) <= EPSILON) continue;

    // Categorisation
    let categorie: string;
    if (Math.abs(delta) < 1) categorie = "rounding";
    else if (delta < 0) categorie = "bug_import_net_as_brut";
    else categorie = "suspect_delta_positif";

    const numero = d.numero ?? `(brouillon-${d.id.slice(0, 8)})`;
    const facturesNumeros = d.factures.map((f) => f.numero).join("; ");
    const facturesStatuts = d.factures.map((f) => f.statut).join("; ");

    console.log(
      [
        csvEscape(numero),
        csvEscape(d.company.name),
        csvEscape(d.statut),
        delta.toFixed(2),
        d.totalHt.toFixed(2),
        expected.toFixed(2),
        d.remise.toFixed(2),
        csvEscape(d.client.name),
        csvEscape(d.objet),
        String(d.factures.length),
        csvEscape(facturesNumeros),
        csvEscape(facturesStatuts),
        categorie,
      ].join(",")
    );
  }
}

main()
  .catch((err) => {
    console.error("Erreur :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
