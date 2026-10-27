/**
 * Normalisation NFC des données PDF (accents décomposés, ex. devis 26273
 * « comédiens », devis NONNA 26023 « leçons »).
 */

import { normalizeNfcDeep } from "../lib/pdf/nfc";

describe("normalizeNfcDeep", () => {
  test("recompose un accent décomposé (e + U+0301 → é)", () => {
    const out = normalizeNfcDeep("Casting 7 comédiens");
    expect(out).toBe("Casting 7 comédiens");
    expect(out).not.toMatch(/́/);
  });

  test("cédille décomposée (c + U+0327 → ç)", () => {
    expect(normalizeNfcDeep("80 leçons")).toBe("80 leçons");
  });

  test("texte déjà NFC inchangé", () => {
    expect(normalizeNfcDeep("Comédienne — 1 250,00 €")).toBe("Comédienne — 1 250,00 €");
  });

  test("objets et tableaux imbriqués (sections → lignes)", () => {
    const devis = {
      objet: "comédiens",
      sections: [{ titre: "Générique", lignes: [{ libelle: "Régie", quantite: 2 }] }],
    };
    expect(normalizeNfcDeep(devis)).toEqual({
      objet: "comédiens",
      sections: [{ titre: "Générique", lignes: [{ libelle: "Régie", quantite: 2 }] }],
    });
  });

  test("Date, nombres, booléens, null conservés (Date non transformée en objet)", () => {
    const d = new Date("2026-10-27T00:00:00.000Z");
    const out = normalizeNfcDeep({ dateEmission: d, total: 10.5, horsCS: true, notes: null });
    expect(out.dateEmission).toBe(d);
    expect(out.dateEmission instanceof Date).toBe(true);
    expect(out).toMatchObject({ total: 10.5, horsCS: true, notes: null });
  });

  test("ne mute pas l'objet d'origine", () => {
    const src = { objet: "comédiens" };
    normalizeNfcDeep(src);
    expect(src.objet).toBe("comédiens");
  });
});
