/**
 * Tests des garde-fous de la facture récapitulative multi-devis (#99).
 * validateRecapDevisSet : règle métier pure (min 2, même client, statut,
 * acompte, déjà facturé, taux TVA uniforme).
 */

import {
  validateRecapDevisSet,
  validateFactureEmittable,
  type RecapDevisInput,
  type EmittableDevisInput,
} from "../lib/facture-recap";
import type { DevisStatut } from "@prisma/client";

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

describe("validateFactureEmittable (#99 garde-fou émission)", () => {
  function ed(over: Partial<EmittableDevisInput> = {}): EmittableDevisInput {
    return {
      numero: "numero" in over ? (over.numero as string | null) : "26001",
      statut: over.statut ?? "VALIDE",
      clientId: over.clientId ?? "clientA",
      tauxTva: over.tauxTva ?? 20,
      emittedElsewhere: over.emittedElsewhere ?? false,
    };
  }

  test("mono facturable → ok", () => {
    expect(validateFactureEmittable({ isRecap: false, devis: [ed()] })).toEqual({ ok: true });
  });

  test("récap tous facturables, même client, TVA uniforme → ok", () => {
    expect(
      validateFactureEmittable({
        isRecap: true,
        devis: [ed({ statut: "ENVOYE" }), ed({ statut: "VALIDE" }), ed({ statut: "ACCEPTE" })],
      })
    ).toEqual({ ok: true });
  });

  test("facture sans devis lié (import) → ok (rien à revalider)", () => {
    expect(validateFactureEmittable({ isRecap: false, devis: [] })).toEqual({ ok: true });
  });

  test.each<DevisStatut>(["BROUILLON", "REFUSE", "EXPIRE"])(
    "devis redevenu %s → refus nommant le devis",
    (statut) => {
      const r = validateFactureEmittable({
        isRecap: true,
        devis: [ed({ numero: "26001" }), ed({ numero: "26002", statut })],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/n'est plus facturable/i);
        expect(r.error).toContain("26002");
      }
    }
  );

  test("devis déjà émis ailleurs → refus", () => {
    const r = validateFactureEmittable({
      isRecap: true,
      devis: [ed({ numero: "26001" }), ed({ numero: "26002", emittedElsewhere: true })],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/déjà été facturé/i);
      expect(r.error).toContain("26002");
    }
  });

  test("récap : clients divergents → refus", () => {
    const r = validateFactureEmittable({
      isRecap: true,
      devis: [ed({ clientId: "A" }), ed({ clientId: "B" })],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/même client/i);
  });

  test("récap : taux TVA divergents → refus", () => {
    const r = validateFactureEmittable({
      isRecap: true,
      devis: [ed({ tauxTva: 20 }), ed({ tauxTva: 10 })],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/taux de TVA différents/i);
  });

  test("mono : TVA/ client non contrôlés (un seul devis) → ok même si tauxTva atypique", () => {
    expect(validateFactureEmittable({ isRecap: false, devis: [ed({ tauxTva: 5.5 })] })).toEqual({
      ok: true,
    });
  });
});
