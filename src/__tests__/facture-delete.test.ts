/**
 * Tests du helper pur de suppression de facture
 * (FEAT-FACTURE-BROUILLON-DELETE).
 *
 * Règle centrale : seul un VRAI brouillon (statut BROUILLON + pas de numéro +
 * pas de emiseAt + aucun paiement) est supprimable. Tout le reste est
 * immuable (art. 289 CGI).
 */

import { canDeleteFacture, type FactureForDelete } from "../lib/facture-delete";

/** Brouillon "propre" : cas nominal supprimable. */
function brouillon(overrides: Partial<FactureForDelete> = {}): FactureForDelete {
  return {
    statut: "BROUILLON",
    numero: null,
    emiseAt: null,
    paiementsCount: 0,
    ...overrides,
  };
}

describe("canDeleteFacture — cas autorisé", () => {
  test("brouillon non numéroté, non émis, sans paiement : suppression autorisée", () => {
    expect(canDeleteFacture(brouillon())).toEqual({ ok: true });
  });
});

describe("canDeleteFacture — statuts non supprimables", () => {
  const statutsRefuses = [
    "EMISE",
    "PAYEE",
    "PAYEE_PARTIEL",
    "EN_RETARD",
    "ANNULEE",
  ] as const;

  test.each(statutsRefuses)("statut %s : refusé", (statut) => {
    const decision = canDeleteFacture(brouillon({ statut }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("attendu refusé");
    // Le message doit citer l'avoir comme voie de sortie légale.
    expect(decision.message).toMatch(/avoir/i);
    expect(decision.message).toMatch(/289/);
  });

  test("une facture EMISE déjà payée reste refusée (pas de message paiement)", () => {
    // Le statut prime : on ne veut pas laisser croire qu'en supprimant les
    // paiements la facture deviendrait supprimable.
    const decision = canDeleteFacture(
      brouillon({ statut: "PAYEE", numero: "26005", emiseAt: new Date(), paiementsCount: 2 })
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("attendu refusé");
    expect(decision.message).toMatch(/brouillon/i);
  });
});

describe("canDeleteFacture — anomalies de données", () => {
  test("statut BROUILLON mais numéro attribué : refusé (trou de séquence)", () => {
    const decision = canDeleteFacture(brouillon({ numero: "26005" }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("attendu refusé");
    expect(decision.message).toMatch(/numéro séquentiel/i);
  });

  test("statut BROUILLON mais emiseAt renseigné : refusé", () => {
    const decision = canDeleteFacture(brouillon({ emiseAt: new Date("2026-09-01") }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("attendu refusé");
    expect(decision.message).toMatch(/déjà été émise/i);
  });

  test("brouillon avec paiements rattachés : refusé (FK RESTRICT côté DB)", () => {
    const decision = canDeleteFacture(brouillon({ paiementsCount: 1 }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("attendu refusé");
    expect(decision.message).toMatch(/paiements/i);
  });

  test("priorité des garde-fous : numéro vérifié avant les paiements", () => {
    // Un brouillon numéroté ET payé doit renvoyer le message le plus grave
    // (numérotation), pas celui des paiements.
    const decision = canDeleteFacture(
      brouillon({ numero: "26005", paiementsCount: 3 })
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("attendu refusé");
    expect(decision.message).toMatch(/numéro séquentiel/i);
  });
});

describe("canDeleteFacture — avoirs", () => {
  test("un avoir en brouillon est supprimable comme toute autre facture brouillon", () => {
    // Le type (ACOMPTE/SOLDE/AVOIR) n'entre pas dans la décision : c'est le
    // cycle de vie (statut/numero/emiseAt) qui tranche.
    expect(canDeleteFacture(brouillon())).toEqual({ ok: true });
  });
});
