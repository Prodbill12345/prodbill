/**
 * ⚠️  LOGIQUE DE CALCUL CRITIQUE — NE PAS MODIFIER SANS TESTS
 *
 * Formule validée avec l'exemple de référence :
 *   Sous-total HT : 3 350 €
 *   CS Comédien 57% (base 900 €) : 513 €
 *   CS Techniciens 65% (base 90 €) : 58,50 €
 *   Base marge = 3 350 + 58,50 = 3 408,50 €  ← CS_COMEDIEN EXCLUS
 *   Frais généraux 5% : 170,43 €
 *   Marge 15% : 511,28 €
 *   TOTAL HT : 4 603,20 € ✓
 */

import type { LigneInput, TauxConfig, CalculResult } from "@/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculerDevis(lignes: LigneInput[], taux: TauxConfig): CalculResult {
  // 1. Sous-total de toutes les lignes
  const sousTotal = round2(
    lignes.reduce((sum, l) => sum + l.quantite * l.prixUnit, 0)
  );

  // 2. Base de calcul des charges sociales
  const baseComedien = lignes
    .filter((l) => l.tag === "COMEDIEN" || l.tag === "DROIT")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);

  const baseTech = lignes
    .filter((l) => l.tag === "TECHNICIEN_HCS")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);

  // 3. Charges sociales
  const csComedien = round2(baseComedien * taux.tauxCsComedien);
  const csTechniciens = round2(baseTech * taux.tauxCsTech);

  // 4. Base marge — ⚠️ csComedien N'ENTRE PAS dans la base marge
  const baseMarge = round2(sousTotal + csTechniciens);

  // 5. Frais généraux et marge — valeurs brutes pour l'accumulation,
  //    arrondies pour l'affichage/stockage séparé
  const fraisGeneraux_raw = baseMarge * taux.tauxFg;
  const marge_raw = baseMarge * taux.tauxMarge;
  const fraisGeneraux = round2(fraisGeneraux_raw);
  const marge = round2(marge_raw);

  // 6. Total HT calculé sur les valeurs BRUTES (non arrondies) pour éviter
  //    les cumuls d'erreurs d'arrondi — cf. exemple de référence : 4 603,20 €
  const totalHt = round2(
    sousTotal + csComedien + csTechniciens + fraisGeneraux_raw + marge_raw
  );

  // 7. TVA et TTC
  const tva = round2(totalHt * 0.2);
  const totalTtc = round2(totalHt + tva);

  return {
    sousTotal,
    csComedien,
    csTechniciens,
    baseMarge,
    fraisGeneraux,
    marge,
    totalHt,
    tva,
    totalTtc,
  };
}

/**
 * Calcule le total d'une seule ligne
 */
export function calculerLigne(quantite: number, prixUnit: number): number {
  return round2(quantite * prixUnit);
}

/**
 * Formate un montant en euros selon les conventions françaises
 */
export function formatEuros(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formate un taux en pourcentage
 */
export function formatPct(rate: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rate);
}
