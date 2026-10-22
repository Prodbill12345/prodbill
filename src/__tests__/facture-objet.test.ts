/**
 * Tests FEAT-FACTURE-OBJET-DESCRIPTION.
 *
 * Les routes n'ont pas de tests dans ce projet : on teste les helpers purs
 * qu'elles appellent (copie mono, verrou brouillon, décision d'affichage
 * PDF/page). Le backfill SQL de la migration est vérifié hors suite.
 */

import {
  cleanText,
  snapshotObjetFromDevis,
  canEditFactureObjet,
  factureObjetDisplay,
} from "../lib/facture-objet";

describe("snapshotObjetFromDevis (création facture mono acompte/solde)", () => {
  test("objet + description copiés", () => {
    expect(
      snapshotObjetFromDevis({ objet: "Spot TV Marque X", description: "Campagne printemps\n3 formats" })
    ).toEqual({ objet: "Spot TV Marque X", descriptionProjet: "Campagne printemps\n3 formats" });
  });
  test("description absente → null, objet copié", () => {
    expect(snapshotObjetFromDevis({ objet: "Spot TV", description: null })).toEqual({
      objet: "Spot TV",
      descriptionProjet: null,
    });
  });
  test("chaînes vides / blanches → null (copie défensive)", () => {
    expect(snapshotObjetFromDevis({ objet: "   ", description: "" })).toEqual({
      objet: null,
      descriptionProjet: null,
    });
  });
  test("espaces de bord retirés", () => {
    expect(snapshotObjetFromDevis({ objet: "  Spot  ", description: null }).objet).toBe("Spot");
  });
});

describe("canEditFactureObjet (édition en brouillon, figé à l'émission)", () => {
  test("BROUILLON jamais émis → éditable", () => {
    expect(canEditFactureObjet({ statut: "BROUILLON", emiseAt: null })).toBe(true);
  });
  test.each(["EMISE", "PAYEE", "ANNULEE", "EN_RETARD"])("%s → figé", (statut) => {
    expect(canEditFactureObjet({ statut, emiseAt: new Date() })).toBe(false);
  });
  test("statut BROUILLON mais emiseAt renseigné (incohérent) → figé par prudence", () => {
    expect(canEditFactureObjet({ statut: "BROUILLON", emiseAt: new Date() })).toBe(false);
  });
});

describe("cleanText (saisie manuelle via PUT)", () => {
  test("vide → null (permet d'effacer un objet en brouillon)", () => {
    expect(cleanText("")).toBeNull();
    expect(cleanText(null)).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
  test("titre global saisi sur une récap → conservé", () => {
    expect(cleanText(" Campagne 2026 — 3 films ")).toBe("Campagne 2026 — 3 films");
  });
});

describe("factureObjetDisplay (PDF + page facture)", () => {
  test("avec objet + description → affichés, objet live du devis plus répété en Réf.", () => {
    expect(
      factureObjetDisplay({ objet: "Spot TV", descriptionProjet: "Campagne" }, "Spot TV (devis)")
    ).toEqual({ objet: "Spot TV", description: "Campagne", refSuffix: "" });
  });
  test("sans objet ni description (pièce émise avant la feature) → rendu inchangé", () => {
    expect(
      factureObjetDisplay({ objet: null, descriptionProjet: null }, "Spot TV (devis)")
    ).toEqual({ objet: null, description: null, refSuffix: "Spot TV (devis)" });
  });
  test("description seule → pas de ligne Objet (pas de label orphelin)", () => {
    const d = factureObjetDisplay({ objet: null, descriptionProjet: "Campagne" }, "");
    expect(d.objet).toBeNull();
    expect(d.description).toBe("Campagne");
  });
  test("récap (rien copié, pas d'objet live) → rien affiché", () => {
    expect(factureObjetDisplay({ objet: null, descriptionProjet: null }, "")).toEqual({
      objet: null,
      description: null,
      refSuffix: "",
    });
  });
  test("objet blanc → traité comme absent", () => {
    expect(factureObjetDisplay({ objet: "  ", descriptionProjet: null }, "X").objet).toBeNull();
  });
});
