/**
 * Tests des garde-fous de la facture récapitulative multi-devis (#99).
 * validateRecapDevisSet : règle métier pure (min 2, même client, statut,
 * acompte, déjà facturé, taux TVA uniforme).
 */

import { validateRecapDevisSet, type RecapDevisInput } from "../lib/facture-recap";

function d(overrides: Partial<RecapDevisInput> = {}): RecapDevisInput {
  return {
    id: overrides.id ?? "d1",
    numero: "numero" in overrides ? overrides.numero! : "26001",
    clientId: overrides.clientId ?? "clientA",
    statut: overrides.statut ?? "VALIDE",
    tauxTva: overrides.tauxTva ?? 20,
    alreadyHasAcompte: overrides.alreadyHasAcompte ?? false,
    alreadyInvoiced: overrides.alreadyInvoiced ?? false,
  };
}

describe("validateRecapDevisSet (#99)", () => {
  test("cas nominal : 2+ devis, même client, VALIDE/ACCEPTE, taux uniforme → ok", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", statut: "VALIDE" }),
      d({ id: "d2", statut: "ACCEPTE" }),
      d({ id: "d3", statut: "VALIDE" }),
    ]);
    expect(r).toEqual({ ok: true, clientId: "clientA" });
  });

  test("moins de 2 devis → refus", () => {
    const r = validateRecapDevisSet([d()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/au moins 2 devis/i);
  });

  test("clients différents → refus", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", clientId: "clientA" }),
      d({ id: "d2", clientId: "clientB" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/même client/i);
  });

  test("ENVOYE est éligible (#99) : VALIDE + ENVOYE → ok", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", numero: "26001", statut: "VALIDE" }),
      d({ id: "d2", numero: "26002", statut: "ENVOYE" }),
    ]);
    expect(r).toEqual({ ok: true, clientId: "clientA" });
  });

  test("un devis non facturable (REFUSE) → refus, message nomme le devis", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", numero: "26001", statut: "VALIDE" }),
      d({ id: "d2", numero: "26002", statut: "REFUSE" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/pour être facturé/i);
      expect(r.error).toContain("26002");
    }
  });

  test("un devis déjà acompté → refus avec message acompte explicite", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", numero: "26001" }),
      d({ id: "d2", numero: "26002", alreadyHasAcompte: true, alreadyInvoiced: true }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/acompte/i);
      expect(r.error).toContain("26002");
    }
  });

  test("un devis déjà facturé (solde) → refus", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1" }),
      d({ id: "d2", numero: "26002", alreadyInvoiced: true }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/déjà été facturé/i);
      expect(r.error).toContain("26002");
    }
  });

  test("taux TVA différents → refus avec le message validé par Vanda", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", tauxTva: 20 }),
      d({ id: "d2", tauxTva: 10 }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe(
        "Les devis sélectionnés ont des taux de TVA différents, facturez-les séparément."
      );
    }
  });

  test("ordre des garde-fous : client vérifié avant statut", () => {
    // clients différents ET un statut invalide → l'erreur client prime
    const r = validateRecapDevisSet([
      d({ id: "d1", clientId: "A", statut: "VALIDE" }),
      d({ id: "d2", clientId: "B", statut: "REFUSE" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/même client/i);
  });

  test("devis brouillon sans numéro → message générique lisible", () => {
    const r = validateRecapDevisSet([
      d({ id: "d1", numero: null, statut: "BROUILLON" }),
      d({ id: "d2", numero: "26002", statut: "VALIDE" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/brouillon sans numéro/i);
  });
});
