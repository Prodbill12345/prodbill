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

  /**
   * Lignes horsMarge=true (tickets #66 #67 #68 — Vanda).
   * Cas d'usage : lignes Musique exclues du calcul FG/Marge.
   * Règle : la ligne et son indexation sont retirées du baseMarge.
   * Les charges sociales et le sousTotal HT restent inchangés.
   * Indépendant du tag — peut s'appliquer à n'importe quelle ligne.
   */
  describe("horsMarge (exclusion FG/Marge sur ligne)", () => {
    test("MUSIQUE non flaggée : calcul identique au baseline", () => {
      const lignes: LigneInput[] = [
        { tag: "STUDIO",  quantite: 1, prixUnit: 1000 },
        { tag: "MUSIQUE", quantite: 1, prixUnit: 500 }, // PAS horsMarge
      ];
      const result = calculerDevis(lignes, tauxRef);

      expect(result.sousTotal).toBe(1500);
      // baseMarge = 1500 + 0 (pas de csTech) = 1500
      expect(result.baseMarge).toBe(1500);
      expect(result.fraisGeneraux).toBe(75);   // 1500 × 5%
      expect(result.marge).toBe(225);          // 1500 × 15%
      expect(result.totalHt).toBe(1800);       // 1500 + 75 + 225
    });

    test("MUSIQUE flaggée : marge réduite du bon montant", () => {
      const lignes: LigneInput[] = [
        { tag: "STUDIO",  quantite: 1, prixUnit: 1000 },
        { tag: "MUSIQUE", quantite: 1, prixUnit: 500, horsMarge: true },
      ];
      const result = calculerDevis(lignes, tauxRef);

      // sousTotal HT INCHANGÉ — la musique reste facturée
      expect(result.sousTotal).toBe(1500);
      // baseMarge ne contient que la ligne STUDIO (1000), MUSIQUE exclue
      expect(result.baseMarge).toBe(1000);
      expect(result.fraisGeneraux).toBe(50);   // 1000 × 5%
      expect(result.marge).toBe(150);          // 1000 × 15%
      // totalHt = 1500 (sousTotal) + 50 (FG) + 150 (marge) = 1700
      expect(result.totalHt).toBe(1700);
    });

    test("indexation d'une ligne flaggée : aussi exclue du baseMarge", () => {
      const lignes: LigneInput[] = [
        { tag: "ARTISTE", quantite: 1, prixUnit: 1000, tauxIndexation: 10, horsMarge: true },
        { tag: "STUDIO",  quantite: 1, prixUnit: 500 },
      ];
      // Sans horsMarge, baseMarge aurait été : 1000 + 100 (idx) + 500 = 1600
      // Avec horsMarge sur ARTISTE : on retire la ligne ET son indexation
      // baseMarge = 500 (STUDIO seulement)
      // CS Comédien reste calculée sur le montant indexé (cotisation due) :
      //   csComedien = (1000 + 100) × 57% = 627
      const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0.05, tauxMarge: 0.15 });

      expect(result.sousTotal).toBe(1600);        // INCHANGÉ : 1000+100+500
      expect(result.csComedien).toBe(627);        // 1100 × 57%, charges dues
      expect(result.baseMarge).toBe(500);         // STUDIO uniquement
      expect(result.fraisGeneraux).toBe(25);      // 500 × 5%
      expect(result.marge).toBe(75);              // 500 × 15%
    });

    test("TECHNICIEN_HCS flaggé : ses CS sont exclues du baseMarge mais restent dues", () => {
      const lignes: LigneInput[] = [
        { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 1000, horsMarge: true },
        { tag: "STUDIO",         quantite: 1, prixUnit: 500 },
      ];
      const result = calculerDevis(lignes, { ...tauxRef, tauxFg: 0.05, tauxMarge: 0.15 });

      // CS Tech total : calculées sur TOUTES les lignes TECH (cotisation due)
      expect(result.csTechniciens).toBe(650);     // 1000 × 65%
      // sousTotal INCHANGÉ
      expect(result.sousTotal).toBe(1500);
      // baseMarge : STUDIO seulement (la ligne TECH ET ses CS sont exclues)
      expect(result.baseMarge).toBe(500);
      expect(result.fraisGeneraux).toBe(25);
      expect(result.marge).toBe(75);
      // totalHt = 1500 (sT) + 650 (csTech) + 25 (FG) + 75 (marge) = 2250
      expect(result.totalHt).toBe(2250);
    });

    test("mix : plusieurs lignes flaggées et non-flaggées", () => {
      const lignes: LigneInput[] = [
        { tag: "ARTISTE",        quantite: 1, prixUnit: 900 },                       // dans baseMarge
        { tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 90 },                        // dans baseMarge
        { tag: "MUSIQUE",        quantite: 1, prixUnit: 500, horsMarge: true },      // EXCLUE
        { tag: "MUSIQUE",        quantite: 1, prixUnit: 200 },                       // dans baseMarge
        { tag: "STUDIO",         quantite: 1, prixUnit: 1000, horsMarge: true },     // EXCLUE
      ];
      const result = calculerDevis(lignes, tauxRef);

      // sousTotal = 900+90+500+200+1000 = 2690 (INCHANGÉ)
      expect(result.sousTotal).toBe(2690);
      // csComedien = 900 × 57% = 513 (toutes ARTISTE)
      expect(result.csComedien).toBe(513);
      // csTechniciens = 90 × 65% = 58.50 (toutes TECH, mais TECH ici non flaggée)
      expect(result.csTechniciens).toBe(58.5);
      // baseMarge :
      //   lignes non-horsMarge : ARTISTE 900 + TECH 90 + MUSIQUE 200 = 1190
      //   + csTech non-horsMarge : 58.50
      //   = 1248.50
      expect(result.baseMarge).toBe(1248.5);
      expect(result.fraisGeneraux).toBe(62.43);  // 1248.50 × 5%
      expect(result.marge).toBe(187.28);         // 1248.50 × 15%
    });
  });
});
