/**
 * scripts/render-pdf-samples.tsx
 *
 * LECTURE SEULE. Génère en local un PDF de chaque gabarit client à partir de
 * vraies pièces (même chargement que les routes /api/.../pdf), pour relire le
 * rendu à l'œil (C-REDESIGN-PHASE1-PDF) :
 *   devis Caleson, devis NONNA (hideTvaTtcOnDevis), facture mono, facture
 *   récap, avoir.
 * Ne choisit que des devis déjà numérotés : la route PDF devis attribue un
 * numéro aux brouillons, ce script n'écrit jamais en base.
 *
 * Usage : npx tsx scripts/render-pdf-samples.tsx <dossier-de-sortie>
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { DevisPdf } from "../src/components/devis/DevisPdf";
import { FacturePdf } from "../src/components/factures/FacturePdf";
import { isRecapFacture, buildRecapDevisList } from "../src/lib/facture-recap-view";

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage : npx tsx scripts/render-pdf-samples.tsx <dossier-de-sortie>");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const DEVIS_INCLUDE = {
  client: true,
  company: true,
  sections: {
    include: { lignes: { orderBy: { ordre: "asc" as const } } },
    orderBy: { ordre: "asc" as const },
  },
};

// Miroir de src/app/api/factures/[id]/pdf/route.ts
const FACTURE_INCLUDE = {
  client: true,
  devis: {
    select: {
      numero: true,
      objet: true,
      totalHt: true,
      sections: {
        orderBy: { ordre: "asc" as const },
        select: {
          id: true,
          titre: true,
          ordre: true,
          lignes: {
            orderBy: { ordre: "asc" as const },
            select: {
              id: true, libelle: true, tag: true, quantite: true, prixUnit: true,
              total: true, tauxIndexation: true, horsMarge: true, horsCS: true,
            },
          },
        },
      },
    },
  },
  devisLinks: {
    select: {
      devis: { select: { id: true, numero: true, objet: true, totalHt: true, remise: true } },
    },
  },
};

async function write(name: string, el: React.ReactElement) {
  const buf = await renderToBuffer(el as never);
  const file = path.join(outDir, name);
  writeFileSync(file, buf);
  console.log(`${name.padEnd(34)} ${(buf.length / 1024).toFixed(1).padStart(7)} Ko`);
}

/** Devis numéroté le plus « riche » (nb de lignes) d'une société. */
async function pickDevis(where: object) {
  const candidats = await prisma.devis.findMany({
    where: { numero: { not: null }, ...where },
    select: { id: true, sections: { select: { _count: { select: { lignes: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const best = candidats
    .map((d) => ({ id: d.id, n: d.sections.reduce((s, x) => s + x._count.lignes, 0) }))
    .sort((a, b) => b.n - a.n)[0];
  return best
    ? prisma.devis.findUniqueOrThrow({ where: { id: best.id }, include: DEVIS_INCLUDE })
    : null;
}

async function renderFacture(name: string, where: object) {
  const facture = await prisma.facture.findFirst({
    where: { numero: { not: null }, ...where },
    include: FACTURE_INCLUDE,
    orderBy: { dateEmission: "desc" },
  });
  if (!facture) {
    console.log(`${name.padEnd(34)} — aucune pièce correspondante en base`);
    return;
  }
  const company = await prisma.company.findUnique({
    where: { id: facture.companyId },
    select: { logoUrl: true },
  });
  const devisList = isRecapFacture(facture.devisId, facture.devisLinks.length)
    ? buildRecapDevisList(facture.devisLinks)
    : null;
  const devis = facture.devis ? { ...facture.devis, numero: facture.devis.numero ?? "" } : null;
  await write(
    name,
    React.createElement(FacturePdf, {
      facture: { ...facture, devis, devisList, logoUrl: company?.logoUrl ?? null },
    })
  );
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  // Les deux sociétés ont hideTvaTtcOnDevis = true (au 27/10/2026).
  const caleson = await prisma.company.findFirstOrThrow({ where: { name: "Caleson" } });
  const nonna = await prisma.company.findFirstOrThrow({ where: { name: { startsWith: "NONNA" } } });

  const devisCaleson = await pickDevis({ companyId: caleson.id });
  if (devisCaleson) await write("1-devis-caleson.pdf", React.createElement(DevisPdf, { devis: devisCaleson }));

  const devisNonna = await pickDevis({ companyId: nonna.id });
  if (devisNonna) await write("2-devis-nonna-sans-tva-ttc.pdf", React.createElement(DevisPdf, { devis: devisNonna }));

  await renderFacture("3-facture-mono.pdf", {
    type: { in: ["ACOMPTE", "SOLDE"] },
    devisId: { not: null },
    devis: { sections: { some: { lignes: { some: {} } } } },
  });
  await renderFacture("4-facture-recap.pdf", { devisId: null, devisLinks: { some: {} }, type: "SOLDE" });
  await renderFacture("5-avoir.pdf", { type: "AVOIR" });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
