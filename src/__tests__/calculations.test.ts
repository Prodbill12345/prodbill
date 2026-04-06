/**
 * Tests unitaires — Logique de calcul
 * Valider impérativement avant toute modification de calculations.ts
 */

import { calculerDevis } from "../lib/calculations";
import type { LigneInput, TauxConfig } from "../types";

describe("calculerDevis", () => {
  const tauxRef: TauxConfig = {
    tauxCsComedien: 0.57,
    tauxCsTech: 0.65,
    tauxFg: 0.05,
    tauxMarge: 0.15,
  };

  /**
   * CAS DE RÉFÉRENCE OBLIGATOIRE
   * Source : spécification métier — ne pas modifier
   */
  test("cas de référence : TOTAL HT = 4 603,20 €", () => {
    const lignes: LigneInput[] = [
      { tag: "COMEDIEN", quantite: 1, prixUnit: 900 },
      { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 90 },
      { tag: "FORFAIT", quantite: 1, prixUnit: 2360 },
    ];

    const result = calculerDevis(lignes, tauxRef);

    expect(result.sousTotal).toBe(3350);
    expect(result.csComedien).toBe(513); // 900 × 57%
    expect(result.csTechniciens).toBe(58.5); // 90 × 65%
    expect(result.baseMarge).toBe(3408.5); // 3350 + 58.50 (csComedien EXCLUS)
    expect(result.fraisGeneraux).toBe(170.43); // 3408.50 × 5%
    expect(result.marge).toBe(511.28); // 3408.50 × 15%
    expect(result.totalHt).toBe(4603.2); // ✓
    expect(result.tva).toBe(920.64); // 4603.20 × 20%
    expect(result.totalTtc).toBe(5523.84);
  });

  test("cs_comedien exclue de la base marge", () => {
    const lignes: LigneInput[] = [
      { tag: "COMEDIEN", quantite: 1, prixUnit: 1000 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0, tauxMarge: 0 });

    // sousTotal = 1000
    // baseMarge = 1000 + 0 (pas de techniciens) = 1000
    // csComedien = 1000 × 57% = 570
    // totalHt = 1000 + 570 + 0 + 0 + 0 = 1570
    expect(result.sousTotal).toBe(1000);
    expect(result.csComedien).toBe(570);
    expect(result.csTechniciens).toBe(0);
    expect(result.baseMarge).toBe(1000);
    expect(result.totalHt).toBe(1570);
  });

  test("lignes DROIT traitées comme COMEDIEN pour cs", () => {
    const lignes: LigneInput[] = [
      { tag: "DROIT", quantite: 1, prixUnit: 500 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0, tauxMarge: 0 });

    expect(result.csComedien).toBe(285); // 500 × 57%
  });

  test("lignes FORFAIT et MATERIEL n'ont pas de charges sociales", () => {
    const lignes: LigneInput[] = [
      { tag: "FORFAIT", quantite: 2, prixUnit: 500 },
      { tag: "MATERIEL", quantite: 1, prixUnit: 300 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0, tauxMarge: 0 });

    expect(result.csComedien).toBe(0);
    expect(result.csTechniciens).toBe(0);
    expect(result.sousTotal).toBe(1300);
    expect(result.totalHt).toBe(1300);
  });

  test("cs_techniciens inclus dans la base marge", () => {
    const lignes: LigneInput[] = [
      { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 100 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0, tauxMarge: 0 });

    // sousTotal = 100
    // csTech = 100 × 65% = 65
    // baseMarge = 100 + 65 = 165  ← techniciens INCLUS
    expect(result.baseMarge).toBe(165);
    expect(result.csTechniciens).toBe(65);
  });

  test("devis vide = tous les totaux à 0", () => {
    const result = calculerDevis([], tauxRef);
    expect(result.sousTotal).toBe(0);
    expect(result.totalHt).toBe(0);
    expect(result.totalTtc).toBe(0);
  });

  test("frais generaux 15%", () => {
    const lignes: LigneInput[] = [
      { tag: "FORFAIT", quantite: 1, prixUnit: 1000 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0.15, tauxMarge: 0 });
    expect(result.fraisGeneraux).toBe(150); // 1000 × 15%
  });
});
