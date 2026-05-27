/**
 * Tests du helper computeFactureTotalsFromDevis (bug #80 NONNA).
 *
 * Couvre :
 *   - Le cas Vanda précis (4900 HT post-remise / -980 remise / 20 % TVA)
 *   - L'invariant clé : devis.tva === facture SOLDE 100 % .tva
 *   - Régression pure : devis sans remise → comportement inchangé
 *   - Acompte / Solde après acompte / Avoir
 *   - Devis à totalHt=0 (edge case)
 */

import { calculerDevis } from "../lib/calculations";
import {
  computeFactureTotalsFromDevis,
  type DevisForFactureCompute,
} from "../lib/invoice-totals";
import type { LigneInput } from "../types";

// Construit un DevisForFactureCompute à partir de l'output de calculerDevis,
// pour s'assurer qu'on teste avec des valeurs cohérentes (et pas inventées).
function asDevisForCompute(
  lignes: LigneInput[],
  taux: Parameters<typeof calculerDevis>[1],
  remise = 0,
  tauxTvaPct = 20
): DevisForFactureCompute & { totalTtcDevis: number; tvaDevis: number } {
  const r = calculerDevis(lignes, taux, remise, tauxTvaPct);
  return {
    totalHt: r.totalHt,
    remise: r.remise,
    coproduction: 0,
    sousTotal: r.sousTotal,
    csComedien: r.csComedien,
    csTechniciens: r.csTechniciens,
    fraisGeneraux: r.fraisGeneraux,
    marge: r.marge,
    tauxTva: tauxTvaPct,
    totalTtcDevis: r.totalTtc,
    tvaDevis: r.tva,
  };
}

const TAUX_REF = {
  tauxCsComedien: 0.57,
  tauxCsTech: 0.65,
  tauxFg: 0.05,
  tauxMarge: 0.15,
};

describe("computeFactureTotalsFromDevis — bug #80 NONNA", () => {
  /**
   * CAS VANDA EXACT (bug #80).
   * Devis NONNA : sousTotal 4900, FG 5 % (245), Marge 15 % (735),
   * Remise -980, TVA 20 %. Pas de CS (lignes STUDIO/MUSIQUE).
   *
   * Calcul attendu côté devis :
   *   baseMarge   = 4900 + 0 = 4900
   *   FG          = 4900 × 5%  = 245
   *   marge       = 4900 × 15% = 735
   *   totalHt     = 4900 + 0 + 0 + 245 + 735 = 5880 (BRUT)
   *   apresRemise = 5880 - 980 = 4900 (NET = base TVA)
   *   tva         = 4900 × 20% = 980
   *   totalTtc    = 4900 + 980 = 5880
   *
   * SOLDE 100 % sans acompte → facture doit afficher :
   *   totalHt brut = 5880, remise = 980, totalHtNet = 4900,
   *   tva = 980, totalTtc = 5880.
   */
  test("cas Vanda exact : facture solde 100% reproduit fidèlement le devis", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 4900 },
    ];
    const devis = asDevisForCompute(lignes, TAUX_REF, 980, 20);

    // Vérif intermédiaire : le devis a bien les chiffres Vanda
    expect(devis.totalHt).toBe(5880);
    expect(devis.remise).toBe(980);
    expect(devis.tvaDevis).toBe(980);
    expect(devis.totalTtcDevis).toBe(5880);

    const r = computeFactureTotalsFromDevis({ devis, type: "SOLDE" });

    expect(r.totalHt).toBe(5880);
    expect(r.remise).toBe(980);
    expect(r.totalHtNet).toBe(4900); // base TVA correcte
    expect(r.tva).toBe(980); // PAS 1176 comme avant le fix
    expect(r.totalTtc).toBe(5880); // PAS 7056
  });

  test("invariant : facture solde 100% .tva === devis.tva (sans acompte)", () => {
    // Plusieurs scénarios pour s'assurer que l'invariant tient
    const scenarios = [
      // Avec CS
      { lignes: [{ tag: "ARTISTE", quantite: 1, prixUnit: 900 }] as LigneInput[], remise: 0 },
      { lignes: [{ tag: "ARTISTE", quantite: 1, prixUnit: 900 }] as LigneInput[], remise: 200 },
      // Cas Vanda
      { lignes: [{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }] as LigneInput[], remise: 980 },
      // Mix
      {
        lignes: [
          { tag: "ARTISTE", quantite: 1, prixUnit: 1500 },
          { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 300 },
          { tag: "STUDIO", quantite: 1, prixUnit: 800 },
        ] as LigneInput[],
        remise: 500,
      },
    ];

    for (const scenario of scenarios) {
      const devis = asDevisForCompute(scenario.lignes, TAUX_REF, scenario.remise, 20);
      const facture = computeFactureTotalsFromDevis({ devis, type: "SOLDE" });
      expect(facture.tva).toBe(devis.tvaDevis);
      expect(facture.totalTtc).toBe(devis.totalTtcDevis);
    }
  });

  test("régression : devis SANS remise → comportement inchangé", () => {
    const lignes: LigneInput[] = [{ tag: "STUDIO", quantite: 1, prixUnit: 1000 }];
    const devis = asDevisForCompute(lignes, TAUX_REF, 0, 20);

    const r = computeFactureTotalsFromDevis({ devis, type: "SOLDE" });
    // Sans remise, totalHt brut === totalHt net
    expect(r.totalHt).toBe(devis.totalHt);
    expect(r.remise).toBe(0);
    expect(r.totalHtNet).toBe(devis.totalHt);
    expect(r.tva).toBe(devis.tvaDevis);
    expect(r.totalTtc).toBe(devis.totalTtcDevis);
  });

  test("acompte 50 % avec remise : prorata sur HT brut + TVA sur HT net prorata", () => {
    const lignes: LigneInput[] = [{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }];
    const devis = asDevisForCompute(lignes, TAUX_REF, 980, 20);
    // devis : totalHt 5880, remise 980, net 4900, tva 980, ttc 5880

    const r = computeFactureTotalsFromDevis({
      devis,
      type: "ACOMPTE",
      pourcentageAcompte: 50,
    });

    expect(r.totalHt).toBe(2940); // 5880 / 2
    expect(r.remise).toBe(490); // 980 / 2
    expect(r.totalHtNet).toBe(2450); // 2940 - 490
    expect(r.tva).toBe(490); // 2450 × 20%
    expect(r.totalTtc).toBe(2940); // 2450 + 490
  });

  test("solde après acompte 50 % : 50 % HT brut restant, TVA cohérente", () => {
    const lignes: LigneInput[] = [{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }];
    const devis = asDevisForCompute(lignes, TAUX_REF, 980, 20);

    // Acompte de 50 % déjà émis → totalHt 2940 BRUT
    const solde = computeFactureTotalsFromDevis({
      devis,
      type: "SOLDE",
      acomptesTotalHt: 2940,
    });

    expect(solde.totalHt).toBe(2940);
    expect(solde.remise).toBe(490);
    expect(solde.totalHtNet).toBe(2450);
    expect(solde.tva).toBe(490);
    expect(solde.totalTtc).toBe(2940);

    // Invariant : acompte + solde === devis complet
    const acompte = computeFactureTotalsFromDevis({
      devis,
      type: "ACOMPTE",
      pourcentageAcompte: 50,
    });
    expect(acompte.tva + solde.tva).toBe(devis.tvaDevis);
    expect(acompte.totalTtc + solde.totalTtc).toBe(devis.totalTtcDevis);
  });

  test("avoir : totalHt négatif, remise négative, TVA négative", () => {
    const lignes: LigneInput[] = [{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }];
    const devis = asDevisForCompute(lignes, TAUX_REF, 980, 20);

    const r = computeFactureTotalsFromDevis({ devis, type: "AVOIR" });

    expect(r.totalHt).toBe(-5880);
    expect(r.remise).toBe(-980);
    expect(r.totalHtNet).toBe(-4900);
    expect(r.tva).toBe(-980);
    expect(r.totalTtc).toBe(-5880);
  });

  test("TVA 0 % (franchise) : tva = 0 et totalTtc = totalHtNet", () => {
    const lignes: LigneInput[] = [{ tag: "STUDIO", quantite: 1, prixUnit: 1000 }];
    const devis = asDevisForCompute(lignes, TAUX_REF, 100, 0);

    const r = computeFactureTotalsFromDevis({ devis, type: "SOLDE" });
    expect(r.tva).toBe(0);
    expect(r.totalTtc).toBe(r.totalHtNet);
  });

  test("devis à totalHt=0 (edge case) : ratio=0 → tout à 0", () => {
    const devis: DevisForFactureCompute = {
      totalHt: 0,
      remise: 0,
      coproduction: 0,
      sousTotal: 0,
      csComedien: 0,
      csTechniciens: 0,
      fraisGeneraux: 0,
      marge: 0,
      tauxTva: 20,
    };
    const r = computeFactureTotalsFromDevis({ devis, type: "SOLDE" });
    expect(r.totalHt).toBe(0);
    expect(r.tva).toBe(0);
    expect(r.totalTtc).toBe(0);
    expect(r.ratio).toBe(0);
  });

  test("composantes au prorata (sousTotal, FG, marge, remise) restent cohérentes", () => {
    const lignes: LigneInput[] = [
      { tag: "ARTISTE", quantite: 1, prixUnit: 900 },
      { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 90 },
      { tag: "STUDIO", quantite: 1, prixUnit: 2360 },
    ];
    const devis = asDevisForCompute(lignes, TAUX_REF, 0, 20);

    const acompte = computeFactureTotalsFromDevis({
      devis,
      type: "ACOMPTE",
      pourcentageAcompte: 50,
    });

    // Chaque composante doit faire ~50% du devis (à l'arrondi près)
    expect(acompte.sousTotal).toBeCloseTo(devis.sousTotal / 2, 0);
    expect(acompte.csComedien).toBeCloseTo(devis.csComedien / 2, 0);
    expect(acompte.csTechniciens).toBeCloseTo(devis.csTechniciens / 2, 0);
    expect(acompte.fraisGeneraux).toBeCloseTo(devis.fraisGeneraux / 2, 0);
    expect(acompte.marge).toBeCloseTo(devis.marge / 2, 0);
  });
});
