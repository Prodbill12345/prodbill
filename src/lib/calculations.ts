/**
 * ⚠️  LOGIQUE DE CALCUL CRITIQUE — NE PAS MODIFIER SANS TESTS
 *
 * Formule avec indexations annuelles incluses dans le sousTotal :
 *
 *   sousTotal     = Σ (quantite × prixUnit) + indexations_artiste + indexations_musique
 *   baseComedien  = Σ lignes ARTISTE(!horsCS) + indexations_artiste(!horsCS)
 *   CS Artistes   = baseComedien × tauxCsComedien      [57%]
 *   CS Techniciens= Σ lignes TECHNICIEN_HCS(!horsCS) × tauxCsTech [65%]
 *   baseMarge     = Σ lignes(!horsMarge) + Σ indexations(!horsMarge)
 *                 + Σ CS_Tech(!horsMarge, !horsCS)     ⚠️ CS Artistes EXCLUS
 *   Frais généraux= baseMarge × tauxFg
 *   Marge         = baseMarge × tauxMarge
 *   TOTAL HT      = sousTotal + CS Artistes + CS Techniciens + FG + Marge
 *   TVA           = TOTAL HT × 20%
 *   TOTAL TTC     = TOTAL HT + TVA
 *
 * Flag `horsMarge` sur une ligne : la ligne et son indexation sont
 * retirées du baseMarge (et la part csTech correspondante si TECH_HCS).
 * sousTotal HT et charges sociales restent inchangés — les cotisations
 * sont dues quoi qu'il arrive. Tickets #66 #67 #68 (Vanda).
 *
 * Flag `horsCS` sur une ligne (FEAT-LIGNE-HORS-CS) : la ligne et son
 * indexation sont retirées de la BASE DES CHARGES SOCIALES. Cas d'usage :
 * un artiste qui facture lui-même (société, auto-entrepreneur, facture
 * étrangère) — pas de cotisation à précompter. Pertinent sur les deux tags
 * qui portent une base CS : ARTISTE et TECHNICIEN_HCS.
 *   - sousTotal HT inchangé : la ligne reste facturée.
 *   - baseMarge inchangé pour la ligne elle-même (elle reste dans FG/Marge,
 *     sauf si horsMarge est aussi coché — les deux flags sont indépendants).
 *   - ⚠️ EFFET DE BORD ASSUMÉ : csTechniciens entre dans baseMarge. Une ligne
 *     TECHNICIEN_HCS en horsCS fait donc aussi BAISSER FG + Marge, puisque la
 *     part de CS qu'elles surfacturaient n'existe plus. Cohérent : pas de CS
 *     → rien à surfacturer dessus.
 */

import type { LigneInput, TauxConfig, CalculResult } from "@/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function indexationRaw(l: LigneInput): number {
  return l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100);
}

/**
 * Calcule les totaux d'un devis.
 *
 * @param lignes      Lignes du devis (tag, quantité, prixUnit, indexation)
 * @param taux        Taux CS / FG / Marge (en décimal 0..1)
 * @param remise      Remise exceptionnelle (€, déductible du HT)
 * @param tauxTvaPct  Taux TVA en POURCENTAGE entier (20, 10, 5.5, 0).
 *                    Défaut : 20 pour rétrocompat avec les appels existants.
 *                    Si 0 → tva = 0 et totalTtc = totalApresRemise.
 */
export function calculerDevis(
  lignes: LigneInput[],
  taux: TauxConfig,
  remise: number = 0,
  tauxTvaPct: number = 20
): CalculResult {
  // 1. Indexations annuelles par type (brutes, pour précision)
  const indexationsArtiste_raw = lignes
    .filter((l) => l.tag === "ARTISTE")
    .reduce((sum, l) => sum + indexationRaw(l), 0);

  const indexationsMusique_raw = lignes
    .filter((l) => l.tag === "MUSIQUE")
    .reduce((sum, l) => sum + indexationRaw(l), 0);

  // 2. Sous-total : base de TOUTES les lignes + TOUTES indexations.
  // Le flag horsMarge n'affecte PAS le sousTotal : la ligne reste facturée.
  const sousTotal = round2(
    lignes.reduce((sum, l) => sum + l.quantite * l.prixUnit, 0)
    + indexationsArtiste_raw + indexationsMusique_raw
  );

  // 3. Bases CS — charges sociales calculées sur les lignes du tag, hormis
  // celles flaggées horsCS (FEAT-LIGNE-HORS-CS : artiste/technicien qui
  // facture lui-même, rien à précompter). Le flag horsMarge, lui, n'a AUCUN
  // effet ici : la cotisation reste due même sur une ligne hors marge.
  const lignesPourCs = lignes.filter((l) => !l.horsCS);

  const baseComedien_raw = lignesPourCs
    .filter((l) => l.tag === "ARTISTE")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);

  const baseTech = lignesPourCs
    .filter((l) => l.tag === "TECHNICIEN_HCS")
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);

  // Indexation artiste entrant dans la base CS : symétrique de horsMarge, le
  // flag emporte la ligne ET son indexation. L'indexation reste dans le
  // sousTotal HT (cf. étape 2) — elle est facturée, simplement pas cotisée.
  const indexationsArtisteCs_raw = lignesPourCs
    .filter((l) => l.tag === "ARTISTE")
    .reduce((sum, l) => sum + indexationRaw(l), 0);

  // 4. Charges sociales
  const csComedien = round2((baseComedien_raw + indexationsArtisteCs_raw) * taux.tauxCsComedien);
  const csTechniciens = round2(baseTech * taux.tauxCsTech);

  // 5. Base marge — exclut les lignes flaggées horsMarge (et leur
  // indexation + part csTech correspondante). csComedien jamais inclus.
  const lignesPourMarge = lignes.filter((l) => !l.horsMarge);
  const sousTotalMarge_raw =
    lignesPourMarge.reduce((sum, l) => sum + l.quantite * l.prixUnit + indexationRaw(l), 0);
  // !horsCS aussi : une ligne technicien sans CS n'apporte pas de part de CS
  // à surfacturer dans la base marge (sinon on facturerait FG/marge sur une
  // charge inexistante).
  const baseTechMarge = lignesPourMarge
    .filter((l) => l.tag === "TECHNICIEN_HCS" && !l.horsCS)
    .reduce((sum, l) => sum + l.quantite * l.prixUnit, 0);
  const csTechMarge_raw = baseTechMarge * taux.tauxCsTech;
  const baseMarge = round2(sousTotalMarge_raw + csTechMarge_raw);

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

  // 10. TVA et TTC calculés sur le total après remise au taux spécifié.
  // tauxTvaPct = 0 → tva = 0 et totalTtc = totalApresRemise (cas
  // "TVA non applicable" : franchise en base, export hors UE, etc.)
  const tva = round2(totalApresRemise * (tauxTvaPct / 100));
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
 * Formate une quantité selon les conventions françaises.
 * Jusqu'à 2 décimales, sans zéros inutiles : 1 → "1", 0.75 → "0,75",
 * 1.5 → "1,5". Vanda facture des fractions d'heure (ticket qté step).
 */
export function formatQuantite(q: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(q);
}

/**
 * Formate un taux en pourcentage
 */
export function formatPct(rate: number): string {
  const pct = Math.round(rate * 10000) / 100;
  return `${pct}%`;
}
