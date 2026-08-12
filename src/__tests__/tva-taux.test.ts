/**
 * Tests BUG-TVA-TAUX-IGNORE : le taux TVA sélectionné doit piloter les calculs
 * (récap devis, facture générée) et le libellé, pas un 20 % figé.
 */

import { calculerDevis } from "../lib/calculations";
import {
  computeFactureTotalsFromDevis,
  type DevisForFactureCompute,
} from "../lib/invoice-totals";
import { formatTvaLabel } from "../lib/tva-label";
import type { TauxConfig } from "../types";

const TAUX: TauxConfig = {
  tauxCsComedien: 0.57,
  tauxCsTech: 0.65,
  tauxFg: 0.05,
  tauxMarge: 0.15,
};

// Une ligne STUDIO simple : pas de CS, HT = prixUnit.
const lignes = [
  { tag: "STUDIO", quantite: 1, prixUnit: 1000, tauxIndexation: 0, horsMarge: false },
] as never;

describe("calculerDevis — respecte le taux TVA passé", () => {
  test("10 % → tva = 10 % du total après remise", () => {
    const r = calculerDevis(lignes, TAUX, 0, 10);
    expect(r.tva).toBeCloseTo(r.totalApresRemise * 0.1, 2);
    expect(r.totalTtc).toBeCloseTo(r.totalApresRemise + r.tva, 2);
  });

  test("5,5 % → tva = 5,5 %", () => {
    const r = calculerDevis(lignes, TAUX, 0, 5.5);
    expect(r.tva).toBeCloseTo(r.totalApresRemise * 0.055, 2);
  });

  test("0 % (non applicable) → tva = 0 et ttc = ht net", () => {
    const r = calculerDevis(lignes, TAUX, 0, 0);
    expect(r.tva).toBe(0);
    expect(r.totalTtc).toBeCloseTo(r.totalApresRemise, 2);
  });

  test("défaut = 20 % (rétrocompat)", () => {
    const r = calculerDevis(lignes, TAUX, 0);
    expect(r.tva).toBeCloseTo(r.totalApresRemise * 0.2, 2);
  });
});

function makeDevis(tauxTvaPct: number): DevisForFactureCompute {
  const r = calculerDevis(lignes, TAUX, 0, tauxTvaPct);
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
  };
}

describe("computeFactureTotalsFromDevis — hérite du taux du devis", () => {
  test("SOLDE d'un devis à 10 % → facture à 10 %", () => {
    const f = computeFactureTotalsFromDevis({ devis: makeDevis(10), type: "SOLDE" });
    expect(f.tva).toBeCloseTo(f.totalHtNet * 0.1, 2);
    expect(f.totalTtc).toBeCloseTo(f.totalHtNet + f.tva, 2);
  });

  test("ACOMPTE 50 % d'un devis à 10 % → prorata à 10 %", () => {
    const f = computeFactureTotalsFromDevis({
      devis: makeDevis(10),
      type: "ACOMPTE",
      pourcentageAcompte: 50,
    });
    expect(f.tva).toBeCloseTo(f.totalHtNet * 0.1, 2);
  });

  test("devis à 5,5 % → facture à 5,5 %", () => {
    const f = computeFactureTotalsFromDevis({ devis: makeDevis(5.5), type: "SOLDE" });
    expect(f.tva).toBeCloseTo(f.totalHtNet * 0.055, 2);
  });
});

describe("immuabilité : la facture fige le taux de son snapshot devis", () => {
  test("une facture calculée sur un snapshot à 20 % reste à 20 % même si le devis passe à 10 %", () => {
    // Snapshot pris à l'émission (20 %).
    const snapshot20 = makeDevis(20);
    const factureEmise = computeFactureTotalsFromDevis({ devis: snapshot20, type: "SOLDE" });

    // Le devis est ensuite modifié à 10 % — nouvel objet, n'affecte pas le snapshot.
    const _devisModifie = makeDevis(10);

    // La facture (calculée sur snapshot20) reste à 20 %.
    expect(factureEmise.tva).toBeCloseTo(factureEmise.totalHtNet * 0.2, 2);
    // Et diffère bien d'une facture calculée à 10 %.
    const facture10 = computeFactureTotalsFromDevis({ devis: makeDevis(10), type: "SOLDE" });
    expect(factureEmise.tva).not.toBeCloseTo(facture10.tva, 2);
  });
});

describe("formatTvaLabel — libellé dynamique", () => {
  test("20 → 'TVA 20%'", () => {
    expect(formatTvaLabel(20)).toBe("TVA 20%");
  });
  test("5.5 → 'TVA 5,5%' (virgule française)", () => {
    expect(formatTvaLabel(5.5)).toBe("TVA 5,5%");
  });
  test("0 → 'TVA non applicable'", () => {
    expect(formatTvaLabel(0)).toBe("TVA non applicable");
  });
  test("10 → 'TVA 10%'", () => {
    expect(formatTvaLabel(10)).toBe("TVA 10%");
  });
});
