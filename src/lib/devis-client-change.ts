import type { DevisStatut } from "@prisma/client";

/**
 * Décision d'autorisation d'un changement de client sur un devis en édition
 * (BUG-DEVIS-EDIT-CLIENT). Logique pure, testable, partagée par la route PUT.
 *
 * Règle (option 1, validée) : le client n'est modifiable que sur un devis
 * BROUILLON ou VALIDE ET tant qu'aucune facture n'existe. Au-delà, le devis
 * engage nominativement le client (numéro attribué, BDC généré, facture
 * immuable) → on bloque pour éviter toute divergence devis/facture/BDC.
 *
 * La vérification d'appartenance du nouveau client au tenant reste côté route
 * (accès DB) — ce helper ne décide que de la règle métier.
 */
export type ClientChangeDecision =
  | "no-change"        // clientId absent ou identique → rien à faire
  | "allowed"          // changement autorisé
  | "blocked-status"   // devis envoyé/accepté/refusé/expiré
  | "blocked-factures"; // une facture existe déjà

export function evaluateClientChange(params: {
  currentClientId: string;
  currentStatut: DevisStatut;
  facturesCount: number;
  newClientId: string | undefined;
}): ClientChangeDecision {
  const { currentClientId, currentStatut, facturesCount, newClientId } = params;

  if (newClientId === undefined || newClientId === currentClientId) {
    return "no-change";
  }
  if (currentStatut !== "BROUILLON" && currentStatut !== "VALIDE") {
    return "blocked-status";
  }
  if (facturesCount > 0) {
    return "blocked-factures";
  }
  return "allowed";
}
