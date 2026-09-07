/**
 * Tests de l'agrégation multi-devis pour la facture récapitulative (#99).
 *
 * Couvre :
 *   - Le cas Vanda MCCANN (1000 + 1000 + 400 = 2400 HT, 1 facture)
 *   - Sommation des composantes (sousTotal/CS/FG/marge)
 *   - Préservation du fix #80 : remise propre à chaque devis, TVA sur le NET
 *   - haveUniformTvaRate (garde-fou taux mixtes)
 *   - Cohérence : facture récap N devis === Σ des soldes 100 % individuels
 */

import { calculerDevis } from "../lib/calculations";
import {
  computeFactureTotalsFromDevis,
  computeFactureTotalsFromMultipleDevis,
  haveUniformTvaRate,
  type DevisForFactureCompute,
} from "../lib/invoice-totals";
import type { LigneInput } from "../types";

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

// Devis "simple" : une seule ligne STUDIO, pas de CS, pas de FG/marge (taux 0),
// pas de remise → totalHt === prixUnit. Sert à raisonner sur des ronds.
const TAUX_PLAT = { tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0, tauxMarge: 0 };
function devisPlat(montant: number, tauxTva = 20) {
  return asDevisForCompute(
    [{ tag: "STUDIO", quantite: 1, prixUnit: montant }],
    TAUX_PLAT,
    0,
    tauxTva
  );
}

describe("computeFactureTotalsFromMultipleDevis (#99)", () => {
  test("cas Vanda MCCANN : 1000 + 1000 + 400 = 2400 HT sur une facture", () => {
    const devisList = [devisPlat(1000), devisPlat(1000), devisPlat(400)];

    const r = computeFactureTotalsFromMultipleDevis(devisList);

    expect(r.totalHt).toBe(2400);
    expect(r.totalHtNet).toBe(2400); // pas de remise
    expect(r.tva).toBe(480); // 2400 × 20%
    expect(r.totalTtc).toBe(2880);
    expect(r.tauxTva).toBe(20);

    // Une ligne par devis, chacune à son HT
    expect(r.perDevis.map((p) => p.totalHt)).toEqual([1000, 1000, 400]);
    expect(r.perDevis.map((p) => p.totalHtNet)).toEqual([1000, 1000, 400]);
  });

  test("facture récap N devis === somme des soldes 100 % individuels", () => {
    const devisList = [
      asDevisForCompute([{ tag: "ARTISTE", quantite: 1, prixUnit: 900 }], TAUX_REF, 0, 20),
      asDevisForCompute(
        [
          { tag: "ARTISTE", quantite: 1, prixUnit: 1500 },
          { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 300 },
          { tag: "STUDIO", quantite: 1, prixUnit: 800 },
        ],
        TAUX_REF,
        500,
        20
      ),
      asDevisForCompute([{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }], TAUX_REF, 980, 20),
    ];

    const recap = computeFactureTotalsFromMultipleDevis(devisList);

    // Somme manuelle des soldes 100 % (round2 par devis puis somme)
    const soldes = devisList.map((d) =>
      computeFactureTotalsFromDevis({ devis: d, type: "SOLDE" })
    );
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const sumOf = (f: (s: (typeof soldes)[number]) => number) =>
      round2(soldes.reduce((a, s) => a + f(s), 0));

    expect(recap.totalHt).toBe(sumOf((s) => s.totalHt));
    expect(recap.totalHtNet).toBe(sumOf((s) => s.totalHtNet));
    expect(recap.tva).toBe(sumOf((s) => s.tva));
    expect(recap.totalTtc).toBe(sumOf((s) => s.totalTtc));
    expect(recap.sousTotal).toBe(sumOf((s) => s.sousTotal));
    expect(recap.csComedien).toBe(sumOf((s) => s.csComedien));
    expect(recap.csTechniciens).toBe(sumOf((s) => s.csTechniciens));
    expect(recap.fraisGeneraux).toBe(sumOf((s) => s.fraisGeneraux));
    expect(recap.marge).toBe(sumOf((s) => s.marge));
    expect(recap.baseMarge).toBe(sumOf((s) => s.baseMarge));
    expect(recap.remise).toBe(sumOf((s) => s.remise));
  });

  test("préserve le fix #80 : remise déduite par devis avant TVA", () => {
    // Deux devis remisés. La TVA doit porter sur le NET de chacun, pas le BRUT.
    const d1 = asDevisForCompute([{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }], TAUX_REF, 980, 20);
    // devis 1 : brut 5880, net 4900, tva 980
    const d2 = devisPlat(1000); // net 1000, tva 200

    const r = computeFactureTotalsFromMultipleDevis([d1, d2]);

    expect(r.totalHt).toBe(6880); // 5880 + 1000 BRUT
    expect(r.remise).toBe(980);
    expect(r.totalHtNet).toBe(5900); // 4900 + 1000 NET
    expect(r.tva).toBe(1180); // 980 + 200 (PAS 6880×20%=1376)
    expect(r.totalTtc).toBe(7080);
  });

  test("un seul devis : équivaut au solde 100 % mono", () => {
    const d = asDevisForCompute([{ tag: "STUDIO", quantite: 1, prixUnit: 4900 }], TAUX_REF, 980, 20);
    const recap = computeFactureTotalsFromMultipleDevis([d]);
    const solde = computeFactureTotalsFromDevis({ devis: d, type: "SOLDE" });

    expect(recap.totalHt).toBe(solde.totalHt);
    expect(recap.tva).toBe(solde.tva);
    expect(recap.totalTtc).toBe(solde.totalTtc);
    expect(recap.perDevis).toHaveLength(1);
  });

  test("liste vide → lève une erreur", () => {
    expect(() => computeFactureTotalsFromMultipleDevis([])).toThrow();
  });

  describe("haveUniformTvaRate", () => {
    test("taux identiques → true", () => {
      expect(haveUniformTvaRate([devisPlat(100, 20), devisPlat(200, 20)])).toBe(true);
    });
    test("taux différents → false", () => {
      expect(haveUniformTvaRate([devisPlat(100, 20), devisPlat(200, 10)])).toBe(false);
    });
    test("taux 0 (franchise) uniforme → true", () => {
      expect(haveUniformTvaRate([devisPlat(100, 0), devisPlat(200, 0)])).toBe(true);
    });
    test("tauxTva absent → traité comme 20 par défaut", () => {
      expect(
        haveUniformTvaRate([{ tauxTva: undefined as unknown as number }, { tauxTva: 20 }])
      ).toBe(true);
    });
    test("liste vide → true (vacuously)", () => {
      expect(haveUniformTvaRate([])).toBe(true);
    });
  });

  test("agrégation avec taux 10 % uniforme", () => {
    const r = computeFactureTotalsFromMultipleDevis([devisPlat(1000, 10), devisPlat(500, 10)]);
    expect(r.totalHt).toBe(1500);
    expect(r.tva).toBe(150); // 1500 × 10%
    expect(r.totalTtc).toBe(1650);
    expect(r.tauxTva).toBe(10);
  });
});
