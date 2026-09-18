/**
 * src/lib/facture-delete.ts
 *
 * Helper PUR décidant si une facture peut être supprimée
 * (FEAT-FACTURE-BROUILLON-DELETE).
 *
 * Règle métier : SEULE une facture en BROUILLON est supprimable. Une facture
 * émise est immuable (art. 289 CGI) — elle s'annule par un AVOIR, jamais par
 * une suppression. La séquence de numérotation ne doit jamais présenter de
 * trou : c'est pourquoi on refuse aussi toute facture qui porte déjà un
 * `numero` ou un `emiseAt`, même si son `statut` dit BROUILLON (anomalie de
 * données / import historique).
 *
 * Source de vérité partagée entre la route DELETE /api/factures/[id] et
 * l'affichage du bouton Supprimer (FactureActions) — même pattern que
 * isDevisFacturable / canUnpayFacture.
 */

import type { FactureStatut } from "@prisma/client";

export interface FactureForDelete {
  statut: FactureStatut;
  /** Numéro séquentiel, attribué à l'émission (#98). NULL sur un brouillon. */
  numero: string | null;
  /** Horodatage d'émission. NULL sur un brouillon. */
  emiseAt: Date | null;
  /**
   * Nombre de paiements rattachés. Le FK Paiement.factureId est ON DELETE
   * RESTRICT : sans ce garde-fou, la suppression exploserait en erreur DB
   * brute au lieu d'un message lisible.
   */
  paiementsCount: number;
}

export type DeleteDecision =
  | { ok: true }
  | { ok: false; message: string };

export function canDeleteFacture(facture: FactureForDelete): DeleteDecision {
  if (facture.statut !== "BROUILLON") {
    return {
      ok: false,
      message:
        "Seule une facture en brouillon peut être supprimée. Une facture émise est immuable (art. 289 CGI) : utilisez « Générer un avoir » pour l'annuler.",
    };
  }

  // Garde-fous anti-anomalie : un brouillon ne peut ni être numéroté ni
  // porter une date d'émission. Si c'est le cas, la pièce a déjà consommé
  // un numéro de séquence — on ne la supprime pas.
  if (facture.numero !== null) {
    return {
      ok: false,
      message:
        "Cette facture porte déjà un numéro séquentiel : elle ne peut pas être supprimée (art. 289 CGI). Utilisez « Générer un avoir ».",
    };
  }

  if (facture.emiseAt !== null) {
    return {
      ok: false,
      message:
        "Cette facture a déjà été émise : elle ne peut pas être supprimée (art. 289 CGI). Utilisez « Générer un avoir ».",
    };
  }

  if (facture.paiementsCount > 0) {
    return {
      ok: false,
      message:
        "Cette facture a des paiements rattachés : supprimez-les d'abord depuis le module paiements.",
    };
  }

  return { ok: true };
}
