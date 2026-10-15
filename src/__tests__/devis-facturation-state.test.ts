/**
 * Tests de getFacturationState — GUARD-DEVIS-DOUBLE-FACTURATION.
 *
 * Couvre la matrice validée avec Vanda :
 *
 *   État du devis               | Acompte | Solde | Récap
 *   ----------------------------|---------|-------|-------
 *   aucune facture              |   ✅    |  ✅   |  ✅
 *   1 acompte (brouillon/émis)  |   ❌    |  ✅   |  ❌
 *   1 solde mono                |   ❌    |  ❌   |  ❌
 *   1 acompte + 1 solde         |   ❌    |  ❌   |  ❌
 *   dans 1 récap                |   ❌    |  ❌   |  ❌
 *   avoir / annulée seulement   |   ✅    |  ✅   |  ✅
 */

import type { FactureStatut } from "@prisma/client";
import {
  getFacturationState,
  type FactureForFacturation,
} from "../lib/devis-facturation-state";

const acompte = (statut: FactureStatut = "EMISE"): FactureForFacturation => ({
  type: "ACOMPTE",
  statut,
});
const solde = (statut: FactureStatut = "EMISE"): FactureForFacturation => ({
  type: "SOLDE",
  statut,
});
const recap = (statut: FactureStatut = "EMISE"): FactureForFacturation => ({
  type: "SOLDE",
  statut,
  isRecap: true,
});

/** Statuts qui « occupent » une place (tout sauf ANNULEE). */
const STATUTS_ACTIFS: FactureStatut[] = [
  "BROUILLON",
  "EMISE",
  "PAYEE_PARTIEL",
  "PAYEE",
  "EN_RETARD",
];

describe("getFacturationState — matrice de facturation", () => {
  test("aucune facture → tout autorisé", () => {
    const s = getFacturationState([]);
    expect(s.canCreateAcompte).toBe(true);
    expect(s.canCreateSolde).toBe(true);
    expect(s.canJoinRecap).toBe(true);
    expect(s.isInvoiced).toBe(false);
    expect(s.acompteBlockedReason).toBeNull();
    expect(s.soldeBlockedReason).toBeNull();
    expect(s.recapBlockedReason).toBeNull();
  });

  // ── 1 acompte : le solde reste ouvert (flux légitime acompte + solde) ──
  describe.each(STATUTS_ACTIFS)("1 acompte %s", (statut) => {
    const s = () => getFacturationState([acompte(statut)]);

    test("acompte refusé (jamais deux acomptes)", () => {
      expect(s().canCreateAcompte).toBe(false);
      expect(s().acompteBlockedReason).toMatch(/déjà un acompte/i);
    });

    test("solde AUTORISÉ — acompte + solde est le flux légitime", () => {
      expect(s().canCreateSolde).toBe(true);
      expect(s().soldeBlockedReason).toBeNull();
    });

    test("récap refusée (règle V1 : pas de déduction d'acompte)", () => {
      expect(s().canJoinRecap).toBe(false);
      expect(s().recapBlockedReason).toMatch(/non géré en V1/i);
    });

    test("devis considéré comme facturé", () => {
      expect(s().isInvoiced).toBe(true);
    });
  });

  // ── 1 solde mono : tout est fermé ──────────────────────────────────────
  describe.each(STATUTS_ACTIFS)("1 solde mono %s", (statut) => {
    const s = () => getFacturationState([solde(statut)]);

    test("solde refusé", () => {
      expect(s().canCreateSolde).toBe(false);
      expect(s().soldeBlockedReason).toMatch(/déjà une facture de solde/i);
    });

    test("acompte refusé — pas d'acompte après solde", () => {
      expect(s().canCreateAcompte).toBe(false);
      expect(s().acompteBlockedReason).toMatch(/plus être créé après le solde/i);
    });

    test("récap refusée", () => {
      expect(s().canJoinRecap).toBe(false);
    });
  });

  // ── acompte + solde : la combinaison complète, plus rien n'est possible ─
  test("1 acompte + 1 solde → tout refusé", () => {
    const s = getFacturationState([acompte(), solde()]);
    expect(s.canCreateAcompte).toBe(false);
    expect(s.canCreateSolde).toBe(false);
    expect(s.canJoinRecap).toBe(false);
    expect(s.isInvoiced).toBe(true);
  });

  test("ordre d'arrivée indifférent (solde chargé avant acompte)", () => {
    const s = getFacturationState([solde(), acompte()]);
    expect(s.canCreateAcompte).toBe(false);
    expect(s.canCreateSolde).toBe(false);
  });

  // ── récap : occupe la place du solde, avec un message dédié ────────────
  describe.each(STATUTS_ACTIFS)("dans 1 récap %s", (statut) => {
    const s = () => getFacturationState([recap(statut)]);

    test("tout refusé", () => {
      expect(s().canCreateAcompte).toBe(false);
      expect(s().canCreateSolde).toBe(false);
      expect(s().canJoinRecap).toBe(false);
    });

    test("message nommant la facture récapitulative", () => {
      expect(s().soldeBlockedReason).toMatch(/récapitulative/i);
      expect(s().acompteBlockedReason).toMatch(/récapitulative/i);
    });
  });

  // ── Avoirs et annulations : hors périmètre, ne bloquent rien ───────────
  test("un AVOIR seul ne bloque rien", () => {
    const s = getFacturationState([{ type: "AVOIR", statut: "EMISE" }]);
    expect(s.canCreateAcompte).toBe(true);
    expect(s.canCreateSolde).toBe(true);
    expect(s.canJoinRecap).toBe(true);
    expect(s.isInvoiced).toBe(false);
  });

  test("une facture ANNULEE ne bloque rien", () => {
    const s = getFacturationState([solde("ANNULEE"), acompte("ANNULEE")]);
    expect(s.canCreateAcompte).toBe(true);
    expect(s.canCreateSolde).toBe(true);
    expect(s.canJoinRecap).toBe(true);
  });

  test("facture annulée + avoir de régularisation → devis re-facturable", () => {
    const s = getFacturationState([
      solde("ANNULEE"),
      { type: "AVOIR", statut: "EMISE" },
    ]);
    expect(s.canCreateSolde).toBe(true);
  });

  /**
   * Scénario d'ÉMISSION (POST /api/factures/[id]/emettre). La route alimente
   * le prédicat avec les AUTRES factures ÉMISES du devis, puis vérifie que la
   * place de la facture en cours est libre. Avant ce ticket, la route bloquait
   * dès qu'une autre facture émise existait, ce qui refusait l'émission du
   * solde après un acompte émis.
   */
  describe("scénario émission — acompte émis puis solde", () => {
    test("solde émissible alors que l'acompte est déjà émis", () => {
      const autresEmises = [acompte("EMISE")];
      expect(getFacturationState(autresEmises).canCreateSolde).toBe(true);
    });

    test("2e solde NON émissible si un solde est déjà émis", () => {
      const autresEmises = [solde("EMISE")];
      expect(getFacturationState(autresEmises).canCreateSolde).toBe(false);
    });

    test("2e acompte NON émissible si un acompte est déjà émis", () => {
      const autresEmises = [acompte("EMISE")];
      expect(getFacturationState(autresEmises).canCreateAcompte).toBe(false);
    });

    test("une facture émise puis ANNULEE ne bloque plus l'émission", () => {
      const autresEmises = [solde("ANNULEE")];
      expect(getFacturationState(autresEmises).canCreateSolde).toBe(true);
    });
  });

  // ── Messages : sortie explicite quand la pièce bloquante est un brouillon
  describe("messages d'erreur — sortie explicite", () => {
    test("acompte en BROUILLON → message indiquant de supprimer le brouillon", () => {
      const s = getFacturationState([acompte("BROUILLON")]);
      expect(s.acompteBlockedReason).toContain("brouillon");
      expect(s.acompteBlockedReason).toMatch(/supprimez/i);
      expect(s.acompteBlockedReason).toMatch(/re-libérer/i);
    });

    test("solde en BROUILLON → message indiquant de supprimer le brouillon", () => {
      const s = getFacturationState([solde("BROUILLON")]);
      expect(s.soldeBlockedReason).toMatch(/supprimez le brouillon de solde/i);
    });

    test("récap en BROUILLON → message nommant le brouillon de récapitulatif", () => {
      const s = getFacturationState([recap("BROUILLON")]);
      expect(s.soldeBlockedReason).toMatch(/supprimez le brouillon de récapitulatif/i);
    });

    test("pièce ÉMISE → aucune sortie proposée (immuabilité art. 289)", () => {
      const s = getFacturationState([solde("EMISE")]);
      expect(s.soldeBlockedReason).not.toMatch(/supprimez/i);
      const a = getFacturationState([acompte("EMISE")]);
      expect(a.acompteBlockedReason).not.toMatch(/supprimez/i);
    });

    test("une pièce ÉMISE l'emporte sur un brouillon du même slot", () => {
      // Anomalie de données (brouillon résiduel à côté d'une facture émise) :
      // le blocage doit rester définitif, sans proposer de sortie trompeuse.
      const s = getFacturationState([solde("BROUILLON"), solde("EMISE")]);
      expect(s.solde.isDraft).toBe(false);
      expect(s.soldeBlockedReason).not.toMatch(/supprimez/i);
    });
  });
});
