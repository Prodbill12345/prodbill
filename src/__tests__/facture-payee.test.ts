/**
 * Tests des helpers purs pour le bouton "Marquer payée" / "Annuler le
 * paiement" (ticket #92).
 */

import {
  computeMarquerPayeePlan,
  canUnpayFacture,
  PAIEMENT_MODE_MARQUEE_MANUELLE,
} from "../lib/facture-payee";

describe("computeMarquerPayeePlan", () => {
  test("aucun paiement existant : crée un auto-paiement du totalTtc complet", () => {
    const plan = computeMarquerPayeePlan(1200, []);
    expect(plan.shouldCreatePaiement).toBe(true);
    expect(plan.autoMontant).toBe(1200);
    expect(plan.autoMode).toBe(PAIEMENT_MODE_MARQUEE_MANUELLE);
    expect(plan.resteAPayer).toBe(1200);
  });

  test("paiements partiels : crée un auto-paiement du reste", () => {
    // Facture 1200, deja 400 paye
    const plan = computeMarquerPayeePlan(1200, [
      { montant: 400, mode: "VIREMENT" },
    ]);
    expect(plan.shouldCreatePaiement).toBe(true);
    expect(plan.autoMontant).toBe(800);
    expect(plan.resteAPayer).toBe(800);
  });

  test("déjà entièrement payé (>= totalTtc) : pas d'auto-paiement", () => {
    // Vanda a deja saisi les vrais paiements pour 1200 + 100, mais la
    // facture est encore en PAYEE_PARTIEL parce que le statut n'a pas
    // ete recalcule. Le bouton "Marquer payée" doit juste basculer le
    // statut sans creer de paiement fantome.
    const plan = computeMarquerPayeePlan(1200, [
      { montant: 800, mode: "VIREMENT" },
      { montant: 400, mode: "CHEQUE" },
    ]);
    expect(plan.shouldCreatePaiement).toBe(false);
    expect(plan.autoMontant).toBe(0);
    expect(plan.resteAPayer).toBe(0);
  });

  test("trop-paye (overpayment) : ne cree pas de paiement, resteAPayer négatif", () => {
    const plan = computeMarquerPayeePlan(1000, [
      { montant: 1100, mode: "VIREMENT" },
    ]);
    expect(plan.shouldCreatePaiement).toBe(false);
    expect(plan.resteAPayer).toBe(-100);
  });

  test("arrondi : somme paiements 999.995 vs total 1000 → reste 0.01", () => {
    // Cas d'arrondi flottant — important pour ne pas creer de
    // micro-paiement parasite.
    const plan = computeMarquerPayeePlan(1000, [
      { montant: 999.99, mode: "VIREMENT" },
    ]);
    expect(plan.resteAPayer).toBe(0.01);
    expect(plan.shouldCreatePaiement).toBe(true);
    expect(plan.autoMontant).toBe(0.01);
  });
});

describe("canUnpayFacture", () => {
  test("aucun paiement : ok, rien à supprimer", () => {
    const r = canUnpayFacture([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.autoPaiementsIds).toEqual([]);
  });

  test("uniquement auto-paiements MARQUEE_MANUELLE : ok, ids à supprimer", () => {
    const r = canUnpayFacture([
      { id: "p-1", montant: 1200, mode: PAIEMENT_MODE_MARQUEE_MANUELLE },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.autoPaiementsIds).toEqual(["p-1"]);
  });

  test("paiement détaillé saisi par Vanda (mode VIREMENT) : refus", () => {
    const r = canUnpayFacture([
      { id: "p-1", montant: 1200, mode: "VIREMENT" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/paiements détaillés/i);
    }
  });

  test("mix auto + vrai : refus (protège les vrais paiements)", () => {
    const r = canUnpayFacture([
      { id: "p-1", montant: 800, mode: "VIREMENT" },
      { id: "p-2", montant: 400, mode: PAIEMENT_MODE_MARQUEE_MANUELLE },
    ]);
    expect(r.ok).toBe(false);
  });

  test("paiement avec mode null (ancien paiement sans mode) : considéré comme détaillé → refus", () => {
    // Securite : un paiement sans mode est probablement un import
    // historique ou une saisie manuelle ancienne. On ne l'efface pas.
    const r = canUnpayFacture([
      { id: "p-1", montant: 1200, mode: null },
    ]);
    expect(r.ok).toBe(false);
  });

  test("plusieurs auto-paiements (cas anormal) : tous supprimés", () => {
    // Cas theorique : 2 clics "Marquer payée" sans unpay entre les deux.
    // Notre logique idempotente devrait empecher ca, mais on est defensif.
    const r = canUnpayFacture([
      { id: "p-1", montant: 600, mode: PAIEMENT_MODE_MARQUEE_MANUELLE },
      { id: "p-2", montant: 600, mode: PAIEMENT_MODE_MARQUEE_MANUELLE },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.autoPaiementsIds).toEqual(["p-1", "p-2"]);
  });
});
