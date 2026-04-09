/**
 * ⚠️  LOGIQUE DE CALCUL CRITIQUE — NE PAS MODIFIER SANS TESTS
 *
 * Formule validée avec l'exemple de référence :
 *   Sous-total HT : 3 350 €
 *   CS Artistes 57% (base 900 €) : 513 €
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

export function calculerDevis(lignes: LigneInput[], taux: TauxConfig, remise: number = 0): CalculResult {
  // 1. Sous-total de toutes les lignes
  const sousTotal = round2(
    lignes.reduce((sum, l) => sum + l.quantite * l.prixUnit, 0)
  );

  // 2. Base de calcul des charges sociales
  const baseComedien = lignes
    .filter((l) => l.tag === "ARTISTE")
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

  // 6. Indexations annuelles — exclues de la base marge (comme CS Artistes)
  const indexations_raw = lignes.reduce(
    (sum, l) => sum + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100),
    0
  );
  const indexations = round2(indexations_raw);

  // 7. Total HT — inclut les indexations (valeurs brutes pour éviter cumuls d'arrondi)
  const totalHt = round2(
    sousTotal + csComedien + csTechniciens + fraisGeneraux_raw + marge_raw + indexations_raw
  );

  // 8. Remise et total après remise
  const remiseArrondie = round2(remise);
  const totalApresRemise = round2(totalHt - remiseArrondie);

  // 9. TVA et TTC calculés sur le total après remise
  const tva = round2(totalApresRemise * 0.2);
  const totalTtc = round2(totalApresRemise + tva);

  return {
    sousTotal,
    csComedien,
    csTechniciens,
    baseMarge,
    fraisGeneraux,
    marge,
    indexations,
    totalHt,
    remise: remiseArrondie,
    totalApresRemise,
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
  const pct = Math.round(rate * 10000) / 100;
  return `${pct}%`;
}
