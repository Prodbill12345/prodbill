/**
 * Numérotation séquentielle par société et par année.
 * Utilise une transaction Prisma atomique pour éviter les doublons.
 *
 * Formats (ticket #95 — format unifié) :
 *   DEVIS   → "26001"  ("YY" + compteur sur 3 chiffres, sans préfixe)
 *           → "DEV-2026-26001"  (si Company.prefixDevis renseigné — feature
 *             préfixe conservée pour d'éventuels futurs workspaces ; Caleson
 *             et NONNA ont leur préfixe vidé, ils sortent donc en "26001").
 *   FACTURE → "26005" (compteur FACTURE, attribué à l'émission, préfixe "F"
 *             à l'affichage). Avoir : "AV-<source>" dérivé côté route. (#98)
 *   BDC     → "BDC-26001"
 *
 * L'affichage "D26001 - objet" est une pure présentation (voir
 * src/lib/devis-numero.ts) : le numéro STOCKÉ reste "26001".
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

export function formatNumero(year: number, value: number, prefix?: string): string {
  // Si un préfixe est configuré sur la Company, on l'utilise tel quel suivi
  // du compteur brut (feature préfixe conservée).
  if (prefix && prefix.length > 0) return `${prefix}${value}`;
  // Format unifié (#95) : "YY" + compteur sur 3 chiffres → "26001".
  // Au-delà de 999/an le padStart n'ampute pas (ex: 1000 → "261000").
  const yy = String(year).slice(-2);
  const seq = String(value).padStart(3, "0");
  return `${yy}${seq}`;
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

/**
 * Numéro de facture séquentiel, attribué À L'ÉMISSION (#98). Tiré du Counter
 * FACTURE de la société, stocké nu ("26005") — le préfixe "F" est ajouté à
 * l'affichage uniquement (src/lib/facture-numero.ts). Indépendant du devis.
 *
 * Atomique : getNextValue fait un upsert increment → pas de doublon même en
 * cas d'appels concurrents (chaque appel obtient une valeur distincte).
 *
 * Extensibilité avoirs : un futur type AVOIR aura son propre Counter (enum
 * CounterType à étendre par migration) et son préfixe "A" à l'affichage. En
 * attendant, l'avoir dérive son numéro de la facture source ("AV-<source>")
 * côté route avoir, sans passer par ce compteur.
 */
export async function getNextFactureNumero(
  companyId: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  return prisma.$transaction(async () => {
    const value = await getNextValue(companyId, year, "FACTURE");
    return formatNumero(year, value);
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
