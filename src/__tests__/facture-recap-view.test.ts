/**
 * Tests de la mise en forme des devis d'une facture récapitulative (#99),
 * partagée PDF / Factur-X / page détail : détection récap + lignes par devis.
 */

import {
  isRecapFacture,
  buildRecapDevisList,
  type RecapDevisLink,
} from "../lib/facture-recap-view";

function link(over: Partial<RecapDevisLink["devis"]> = {}): RecapDevisLink {
  return {
    devis: {
      id: over.id ?? "d1",
      numero: "numero" in over ? (over.numero as string | null) : "26001",
      objet: over.objet ?? "Objet",
      totalHt: over.totalHt ?? 1000,
      remise: over.remise ?? 0,
    },
  };
}

describe("isRecapFacture (#99)", () => {
  test("devisId null + 2 liens → récap", () => {
    expect(isRecapFacture(null, 2)).toBe(true);
  });
  test("devisId null + 3 liens → récap", () => {
    expect(isRecapFacture(null, 3)).toBe(true);
  });
  test("facture mono (devisId renseigné, 1 lien) → non récap", () => {
    expect(isRecapFacture("dev-123", 1)).toBe(false);
  });
  test("devisId null mais 1 seul lien → non récap (mono sans devisId legacy)", () => {
    expect(isRecapFacture(null, 1)).toBe(false);
  });
  test("devisId null + 0 lien (import CSV) → non récap", () => {
    expect(isRecapFacture(null, 0)).toBe(false);
  });
});

describe("buildRecapDevisList (#99)", () => {
  test("cas Vanda MCCANN : 3 devis, montants HT nets, somme = 2400", () => {
    const lines = buildRecapDevisList([
      link({ id: "d1", numero: "26001", objet: "Spot A", totalHt: 1000 }),
      link({ id: "d2", numero: "26002", objet: "Spot B", totalHt: 1000 }),
      link({ id: "d3", numero: "26003", objet: "Spot C", totalHt: 400 }),
    ]);
    expect(lines.map((l) => l.montantHt)).toEqual([1000, 1000, 400]);
    expect(lines.reduce((s, l) => s + l.montantHt, 0)).toBe(2400);
    expect(lines[0]).toMatchObject({ id: "d1", numero: "26001", objet: "Spot A" });
  });

  test("HT NET = totalHt - remise", () => {
    const [l] = buildRecapDevisList([link({ totalHt: 5880, remise: 980 })]);
    expect(l.montantHt).toBe(4900);
  });

  test("numero null → chaîne vide (affichage brouillon géré côté vue)", () => {
    const [l] = buildRecapDevisList([link({ numero: null })]);
    expect(l.numero).toBe("");
  });

  test("arrondi 2 décimales", () => {
    const [l] = buildRecapDevisList([link({ totalHt: 100.005, remise: 0 })]);
    expect(l.montantHt).toBe(100.01);
  });
});
