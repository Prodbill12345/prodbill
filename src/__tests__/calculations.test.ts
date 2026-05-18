/**
 * Tests unitaires — Logique de calcul
 * Valider impérativement avant toute modification de calculations.ts
 */

import { calculerDevis, calculerLigne } from "../lib/calculations";
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
      { tag: "ARTISTE", quantite: 1, prixUnit: 900 },
      { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 90 },
      { tag: "STUDIO", quantite: 1, prixUnit: 2360 },
    ];

    const result = calculerDevis(lignes, tauxRef);

    expect(result.sousTotal).toBe(3350);
    expect(result.csComedien).toBe(513); // 900 × 57%
    expect(result.csTechniciens).toBe(58.5); // 90 × 65%
    expect(result.baseMarge).toBe(3408.5); // 3350 + 58.50 (csArtistes EXCLUS)
    expect(result.fraisGeneraux).toBe(170.43); // 3408.50 × 5%
    expect(result.marge).toBe(511.28); // 3408.50 × 15%
    expect(result.totalHt).toBe(4603.2); // ✓
    expect(result.tva).toBe(920.64); // 4603.20 × 20%
    expect(result.totalTtc).toBe(5523.84);
  });

  test("cs_artistes exclue de la base marge", () => {
    const lignes: LigneInput[] = [
      { tag: "ARTISTE", quantite: 1, prixUnit: 1000 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0, tauxMarge: 0 });

    // sousTotal = 1000
    // baseMarge = 1000 + 0 (pas de techniciens) = 1000
    // csArtistes = 1000 × 57% = 570
    // totalHt = 1000 + 570 + 0 + 0 + 0 = 1570
    expect(result.sousTotal).toBe(1000);
    expect(result.csComedien).toBe(570);
    expect(result.csTechniciens).toBe(0);
    expect(result.baseMarge).toBe(1000);
    expect(result.totalHt).toBe(1570);
  });

  test("lignes STUDIO et MUSIQUE n'ont pas de charges sociales", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 2, prixUnit: 500 },
      { tag: "MUSIQUE", quantite: 1, prixUnit: 300 },
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

  /**
   * Tests TVA personnalisable (FIX 2). Le param tauxTvaPct accepte un
   * pourcentage entier. Valeur par défaut 20 garantit la rétrocompat.
   */
  describe("tauxTvaPct paramétrable", () => {
    const studioOnly: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 1000 },
    ];
    const tauxZero = { ...tauxRef, tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0, tauxMarge: 0 };

    test("défaut 20% (rétrocompat avec ancien comportement)", () => {
      const r = calculerDevis(studioOnly, tauxZero);
      expect(r.totalHt).toBe(1000);
      expect(r.tva).toBe(200);
      expect(r.totalTtc).toBe(1200);
    });

    test("10% (cas SACEM)", () => {
      const r = calculerDevis(studioOnly, tauxZero, 0, 10);
      expect(r.tva).toBe(100);
      expect(r.totalTtc).toBe(1100);
    });

    test("5.5% (super-réduit, livre/spectacle vivant)", () => {
      const r = calculerDevis(studioOnly, tauxZero, 0, 5.5);
      expect(r.tva).toBe(55);
      expect(r.totalTtc).toBe(1055);
    });

    test('0% (TVA non applicable) → tva=0 et totalTtc=totalApresRemise', () => {
      const r = calculerDevis(studioOnly, tauxZero, 0, 0);
      expect(r.tva).toBe(0);
      expect(r.totalApresRemise).toBe(1000);
      expect(r.totalTtc).toBe(1000); // === totalApresRemise
    });

    test("TVA 0% avec remise : totalTtc = totalHt - remise", () => {
      const r = calculerDevis(studioOnly, tauxZero, 100, 0);
      expect(r.totalHt).toBe(1000);
      expect(r.totalApresRemise).toBe(900);
      expect(r.tva).toBe(0);
      expect(r.totalTtc).toBe(900);
    });
  });

  test("frais generaux 15%", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 1000 },
    ];
    const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0.15, tauxMarge: 0 });
    expect(result.fraisGeneraux).toBe(150); // 1000 × 15%
  });

  /**
   * Sémantique remise — figée pour éviter régression d'affichage.
   *
   * Convention : totalHt reste le BRUT (avant remise). C'est
   * totalApresRemise (= totalHt - remise) qui est utilisé comme
   * base TVA et affiché en tant que "TOTAL HT" sur la fiche
   * devis et le PDF.
   */
  test("remise : totalHt reste brut, totalApresRemise est le net taxable", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 7420 },
    ];
    const result = calculerDevis(
      lignes,
      { ...tauxRef, tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0.05, tauxMarge: 0.15 },
      1820
    );

    expect(result.sousTotal).toBe(7420);
    expect(result.fraisGeneraux).toBe(371); // 7420 × 5%
    expect(result.marge).toBe(1113); // 7420 × 15%
    // totalHt = sousTotal + FG + marge = 7420 + 371 + 1113 = 8904 (BRUT)
    expect(result.totalHt).toBe(8904);
    expect(result.remise).toBe(1820);
    // totalApresRemise = totalHt - remise = 8904 - 1820 = 7084 (NET)
    expect(result.totalApresRemise).toBe(7084);
    // TVA assise sur le NET, pas sur le brut
    expect(result.tva).toBe(1416.8); // 7084 × 20%
    expect(result.totalTtc).toBe(8500.8); // 7084 + 1416.80
  });

  /**
   * Cas P.U. HT à 0€ — "ligne offerte" (Vanda Caleson #75).
   *
   * La Réalisation est souvent à 0€ chez Caleson : Vanda veut la
   * faire apparaître au client pour qu'il voie le prix qu'elle
   * offre. Le calcul doit gérer ça proprement.
   */
  test("ligne à P.U. 0€ → total ligne 0, n'impacte pas les autres", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 1000 },
      { tag: "STUDIO", quantite: 1, prixUnit: 0 }, // Réalisation offerte
    ];
    const result = calculerDevis(
      lignes,
      { ...tauxRef, tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0.05, tauxMarge: 0.15 }
    );
    expect(result.sousTotal).toBe(1000); // 1000 + 0
    expect(result.fraisGeneraux).toBe(50);
    expect(result.marge).toBe(150);
    expect(result.totalHt).toBe(1200);
  });

  test("toutes lignes à 0€ → totalHt 0, totalTtc 0 (cas edge légitime)", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 0 },
      { tag: "STUDIO", quantite: 2, prixUnit: 0 },
    ];
    const result = calculerDevis(lignes, tauxRef);
    expect(result.sousTotal).toBe(0);
    expect(result.totalHt).toBe(0);
    expect(result.tva).toBe(0);
    expect(result.totalTtc).toBe(0);
  });

  test("ligne ARTISTE à 0€ → CS Comédien 0 (cohérent)", () => {
    const lignes: LigneInput[] = [
      { tag: "ARTISTE", quantite: 1, prixUnit: 0 },
      { tag: "STUDIO", quantite: 1, prixUnit: 500 },
    ];
    const result = calculerDevis(
      lignes,
      { ...tauxRef, tauxCsTech: 0, tauxFg: 0, tauxMarge: 0 }
    );
    expect(result.csComedien).toBe(0); // 0 × 57% = 0
    expect(result.sousTotal).toBe(500);
    expect(result.totalHt).toBe(500);
  });

  test("ligne à 0€ avec quantite > 1 → reste 0", () => {
    expect(calculerLigne(5, 0)).toBe(0);
    expect(calculerLigne(100, 0)).toBe(0);
  });

  test("remise nulle : totalApresRemise === totalHt", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 1000 },
    ];
    const result = calculerDevis(
      lignes,
      { ...tauxRef, tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0, tauxMarge: 0 }
    );
    expect(result.remise).toBe(0);
    expect(result.totalApresRemise).toBe(result.totalHt);
  });

  /**
   * Convention d'affichage TOTAL HT — Devis ET Facture.
   *
   * Côté Devis : on affiche `totalApresRemise` (stocké).
   * Côté Facture : pas de champ totalApresRemise — on calcule
   *   `displayTotalHt = totalHt - remise` au moment du rendu
   *   (cf. FacturePdf.tsx + fiche facture).
   *
   * Les deux doivent donner le même résultat pour des données
   * équivalentes Devis ↔ Facture.
   */
  test("affichage TOTAL HT : Devis.totalApresRemise === Facture(totalHt - remise) pour data equivalente", () => {
    const lignes: LigneInput[] = [
      { tag: "STUDIO", quantite: 1, prixUnit: 7420 },
    ];
    const result = calculerDevis(
      lignes,
      { ...tauxRef, tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0.05, tauxMarge: 0.15 },
      1820
    );

    // Simulation d'une Facture qui hériterait des mêmes valeurs
    // (snapshot identique au Devis source) :
    const facture = {
      totalHt: result.totalHt, // 8904 (BRUT)
      remise: result.remise,   // 1820
      tva: result.tva,         // 1416.80
      totalTtc: result.totalTtc, // 8500.80
    };

    const factureDisplayHt = facture.totalHt - facture.remise;
    expect(factureDisplayHt).toBe(result.totalApresRemise);
    expect(factureDisplayHt).toBe(7084);

    // La TVA stockée correspond bien à 20 % de l'HT affiché
    expect(facture.tva).toBeCloseTo(factureDisplayHt * 0.2, 2);
  });
});
