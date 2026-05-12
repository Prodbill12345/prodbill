/**
 * Numérotation séquentielle par société et par année.
 * Utilise une transaction Prisma atomique pour éviter les doublons.
 *
 * Formats :
 *   DEVIS   → "25-0042"  (legacy, sans préfixe)
 *           → "DEV-2026-26001"  (si Company.prefixDevis = "DEV-2026-")
 *   FACTURE → dérivé du numéro de devis : "${devisNumero}-A1", "-S1", "AV-…"
 *   BDC     → "BDC-25-0042"
 */

import { prisma } from "@/lib/prisma";
import type { CounterType } from "@prisma/client";

async function getNextValue(
  companyId: string,
  year: number,
  type: CounterType
): Promise<number> {
  const counter = await prisma.counter.upsert({
    where: { companyId_year_type: { companyId, year, type } },
    update: { value: { increment: 1 } },
    create: { companyId, year, type, value: 1 },
  });
  return counter.value;
}

function formatNumero(year: number, value: number, prefix?: string): string {
  // Si un préfixe est configuré sur la Company, on l'utilise tel quel suivi
  // du compteur brut (cas NONNA : "DEV-2026-" + 26001 = "DEV-2026-26001").
  if (prefix && prefix.length > 0) return `${prefix}${value}`;
  // Legacy : "YY-NNNN" (Caleson)
  const yy = String(year).slice(-2);
  const seq = String(value).padStart(4, "0");
  return `${yy}-${seq}`;
}

export async function getNextDevisNumero(
  companyId: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  return prisma.$transaction(async () => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { prefixDevis: true },
    });
    const value = await getNextValue(companyId, year, "DEVIS");
    return formatNumero(year, value, company?.prefixDevis);
  });
}

export async function getNextFactureNumero(
  companyId: string,
  type: "ACOMPTE" | "SOLDE" | "AVOIR",
  devisNumero: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  return prisma.$transaction(async () => {
    await getNextValue(companyId, year, "FACTURE");
    switch (type) {
      case "ACOMPTE":
        return `${devisNumero}-A1`;
      case "SOLDE":
        return `${devisNumero}-S1`;
      case "AVOIR":
        return `AV-${devisNumero}`;
    }
  });
}

export async function getNextBDCNumero(
  companyId: string,
  devisNumero: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  return prisma.$transaction(async () => {
    await getNextValue(companyId, year, "BDC");
    return `BDC-${devisNumero}`;
  });
}
