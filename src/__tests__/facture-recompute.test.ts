/**
 * Tests du recalcul des totaux d'une facture BROUILLON depuis l'état COURANT
 * des devis liés (#99 BUG-RECAP-BROUILLON-STALE). Cœur pur : computeFacturePersistTotals.
 *
 * Scénario clé : un devis est modifié APRÈS la création du brouillon → le
 * recalcul doit refléter le nouveau devis (mono solde, mono acompte, récap).
 */

import { calculerDevis } from "../lib/calculations";
import { computeFactureTotalsFromDevis } from "../lib/invoice-totals";
import { computeFacturePersistTotals } from "../lib/facture-recompute";
import type { DevisStatut } from "@prisma/client";

const TAUX_PLAT = { tauxCsComedien: 0, tauxCsTech: 0, tauxFg: 0, tauxMarge: 0 };

// Construit une ligne de devis (payload DEVIS_RECOMPUTE_SELECT) à partir de
// calculerDevis, pour tester avec des totaux cohérents.
function devisRow(
  montant: number,
  opts: { id?: string; remise?: number; tauxTva?: number; statut?: DevisStatut; clientId?: string } = {}
) {
  const r = calculerDevis(
    [{ tag: "STUDIO", quantite: 1, prixUnit: montant }],
    TAUX_PLAT,
    opts.remise ?? 0,
    opts.tauxTva ?? 20
  );
  return {
    id: opts.id ?? "d1",
    numero: "26001",
    statut: (opts.statut ?? "VALIDE") as DevisStatut,
    clientId: opts.clientId ?? "clientA",
    totalHt: r.totalHt,
    remise: r.remise,
    coproduction: 0,
    sousTotal: r.sousTotal,
    csComedien: r.csComedien,
    csTechniciens: r.csTechniciens,
    fraisGeneraux: r.fraisGeneraux,
    marge: r.marge,
    tauxTva: opts.tauxTva ?? 20,
    tvaMention: null as string | null,
  };
}

describe("computeFacturePersistTotals (#99)", () => {
  test("mono SOLDE : reflète le NOUVEAU total du devis après édition", () => {
    // Brouillon solde créé quand le devis valait 1000 (facture.totalHt=1000).
    // Le devis passe à 1500. Le recalcul doit donner 1500 HT / 300 TVA / 1800 TTC.
    const facture = { type: "SOLDE" as const, devisId: "d1", totalHt: 1000, pourcentageAcompte: null };
    const newDevis = devisRow(1500);
    const t = computeFacturePersistTotals(facture, [newDevis], 0)!;
    expect(t.totalHt).toBe(1500);
    expect(t.tva).toBe(300);
    expect(t.totalTtc).toBe(1800);
  });

  test("mono ACOMPTE (pct mémorisé 50%) : 50% du NOUVEAU total", () => {
    const facture = { type: "ACOMPTE" as const, devisId: "d1", totalHt: 500, pourcentageAcompte: 50 };
    const newDevis = devisRow(1500); // devis passé de 1000 à 1500
    const t = computeFacturePersistTotals(facture, [newDevis], 0)!;
    expect(t.totalHt).toBe(750); // 50% de 1500
    expect(t.tva).toBe(150);
    expect(t.totalTtc).toBe(900);
  });

  test("mono ACOMPTE legacy (pct null) : dérive le % du ratio courant", () => {
    // Facture legacy sans pourcentageAcompte : totalHt 500, devis 1000 → 50%.
    const facture = { type: "ACOMPTE" as const, devisId: "d1", totalHt: 500, pourcentageAcompte: null };
    const devis = devisRow(1000);
    const t = computeFacturePersistTotals(facture, [devis], 0)!;
    expect(t.totalHt).toBe(500);
    expect(t.tva).toBe(100);
  });

  test("mono SOLDE après acompte : déduit les acomptes du NOUVEAU total", () => {
    const facture = { type: "SOLDE" as const, devisId: "d1", totalHt: 500, pourcentageAcompte: null };
    const newDevis = devisRow(1500);
    // 600 déjà facturés en acompte → solde = 1500 - 600 = 900
    const t = computeFacturePersistTotals(facture, [newDevis], 600)!;
    expect(t.totalHt).toBe(900);
    expect(t.tva).toBe(180); // (900 - 0 remise) × 20%
  });

  test("récap : reflète la somme des NOUVEAUX totaux (MCCANN 2400 → 2900)", () => {
    const facture = { type: "SOLDE" as const, devisId: null, totalHt: 2400, pourcentageAcompte: null };
    // Un des devis passe de 1000 à 1500 → total 2900.
    const devisRows = [
      devisRow(1500, { id: "d1" }),
      devisRow(1000, { id: "d2" }),
      devisRow(400, { id: "d3" }),
    ];
    const t = computeFacturePersistTotals(facture, devisRows, 0)!;
    expect(t.totalHt).toBe(2900);
    expect(t.tva).toBe(580); // 2900 × 20%
    expect(t.totalTtc).toBe(3480);
  });

  test("récap avec remise par devis : TVA par devis puis sommée (fix #80 préservé)", () => {
    const facture = { type: "SOLDE" as const, devisId: null, totalHt: 0, pourcentageAcompte: null };
    const d1 = devisRow(5880, { id: "d1", remise: 980 }); // net 4900, tva 980
    const d2 = devisRow(1000, { id: "d2" }); // net 1000, tva 200
    const t = computeFacturePersistTotals(facture, [d1, d2], 0)!;
    expect(t.totalHt).toBe(6880); // brut
    expect(t.remise).toBe(980);
    expect(t.tva).toBe(1180); // 980 + 200 (pas 6880×20%)
    expect(t.totalTtc).toBe(7080);
  });

  test("recalcul mono SOLDE 100% === helper mono direct (cohérence)", () => {
    const devis = devisRow(3333, { remise: 333 });
    const facture = { type: "SOLDE" as const, devisId: "d1", totalHt: 0, pourcentageAcompte: null };
    const t = computeFacturePersistTotals(facture, [devis], 0)!;
    const direct = computeFactureTotalsFromDevis({
      devis: {
        totalHt: devis.totalHt, remise: devis.remise, coproduction: 0,
        sousTotal: devis.sousTotal, csComedien: devis.csComedien,
        csTechniciens: devis.csTechniciens, fraisGeneraux: devis.fraisGeneraux,
        marge: devis.marge, tauxTva: 20,
      },
      type: "SOLDE",
    });
    expect(t.totalHt).toBe(direct.totalHt);
    expect(t.tva).toBe(direct.tva);
    expect(t.totalTtc).toBe(direct.totalTtc);
  });

  test("AVOIR → null (jamais recalculé, émis directement)", () => {
    const facture = { type: "AVOIR" as const, devisId: "d1", totalHt: -1000, pourcentageAcompte: null };
    expect(computeFacturePersistTotals(facture, [devisRow(1000)], 0)).toBeNull();
  });

  test("aucun devis lié (import) → null (on garde les totaux stockés)", () => {
    const facture = { type: "SOLDE" as const, devisId: null, totalHt: 1000, pourcentageAcompte: null };
    expect(computeFacturePersistTotals(facture, [], 0)).toBeNull();
  });
});
