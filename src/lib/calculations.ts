/**
 * ⚠️  LOGIQUE DE CALCUL CRITIQUE — NE PAS MODIFIER SANS TESTS
 *
 * Formule avec indexations annuelles incluses dans le sousTotal :
 *
 *   sousTotal     = Σ (quantite × prixUnit) + indexations_artiste + indexations_musique
 *   baseComedien  = Σ lignes ARTISTE (quantite × prixUnit) + indexations_artiste
 *   CS Artistes   = baseComedien × tauxCsComedien      [57%]
 *   CS Techniciens= Σ lignes TECHNICIEN_HCS × tauxCsTech [65%]
 *   baseMarge     = sousTotal + CS Techniciens          ⚠️ CS Artistes EXCLUS
 *   Frais généraux= baseMarge × tauxFg
 *   Marge         = baseMarge × tauxMarge
 *   TOTAL HT      = sousTotal + CS Artistes + CS Techniciens + FG + Marge
 *   TVA           = TOTAL HT × 20%
 *   TOTAL TTC     = TOTAL HT + TVA
 */

import type { LigneInput, TauxConfig, CalculResult } from "@/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculerDevis(lignes: LigneInput[], taux: TauxConfig, remise: number = 0): CalculResult {
  // 1. Indexations annuelles par type (brutes, pour précision)
  const indexationsArtiste_raw = lignes
    .filter((l) => l.tag === "ARTISTE")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0);

  const indexationsMusique_raw = lignes
    .filter((l) => l.tag === "MUSIQUE")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0);

  // 2. Sous-total : base de toutes les lignes + indexations (incluses dès le départ)
  const sousTotal = round2(
    lignes.reduce((sum, l) => sum + l.quantite * l.prixUnit, 0)
    + indexationsArtiste_raw + indexationsMusique_raw
  );

  // 3. Bases CS
  // baseComedien inclut l'indexation artiste → la CS s'applique sur le montant indexé
  const baseComedien_raw = lignes
    .filter((l) => l.tag === "ARTISTE")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);

  const baseTech = lignes
    .filter((l) => l.tag === "TECHNICIEN_HCS")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);

  // 4. Charges sociales
  const csComedien = round2((baseComedien_raw + indexationsArtiste_raw) * taux.tauxCsComedien);
  const csTechniciens = round2(baseTech * taux.tauxCsTech);

  // 5. Base marge — ⚠️ csComedien N'ENTRE PAS dans la base marge
  const baseMarge = round2(sousTotal + csTechniciens);

  // 6. Frais généraux et marge (valeurs brutes pour éviter cumuls d'arrondi)
  const fraisGeneraux_raw = baseMarge * taux.tauxFg;
  const marge_raw = baseMarge * taux.tauxMarge;
  const fraisGeneraux = round2(fraisGeneraux_raw);
  const marge = round2(marge_raw);

  // 7. Indexations arrondies pour affichage/stockage
  const indexationsArtiste = round2(indexationsArtiste_raw);
  const indexationsMusique = round2(indexationsMusique_raw);

  // 8. Total HT — les indexations sont dans sousTotal, ne pas les ajouter une 2e fois
  const totalHt = round2(
    sousTotal + csComedien + csTechniciens + fraisGeneraux_raw + marge_raw
  );

  // 9. Remise et total après remise
  const remiseArrondie = round2(remise);
  const totalApresRemise = round2(totalHt - remiseArrondie);

  // 10. TVA et TTC calculés sur le total après remise
  const tva = round2(totalApresRemise * 0.2);
  const totalTtc = round2(totalApresRemise + tva);

  return {
    sousTotal,
    csComedien,
    csTechniciens,
    baseMarge,
    fraisGeneraux,
    marge,
    indexationsArtiste,
    indexationsMusique,
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
