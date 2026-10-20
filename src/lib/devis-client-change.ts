import type { DevisStatut } from "@prisma/client";

/**
 * Décision d'autorisation d'un changement de client sur un devis en édition
 * (BUG-DEVIS-EDIT-CLIENT). Logique pure, testable, partagée par la route PUT.
 *
 * Règle (FIX-CLIENT-CHANGE-ENVOYE) : le client est modifiable sur TOUT statut
 * tant qu'aucune facture n'est liée au devis. C'est la facture (immuable) qui
 * engage nominativement le client, pas le statut du devis — cohérent avec
 * isDevisFacturable (ENVOYE/ACCEPTE facturables) : un devis envoyé ou accepté
 * par le mauvais contact doit pouvoir être corrigé avant facturation.
 * L'ancienne restriction BROUILLON/VALIDE (option 1) est abandonnée.
 *
 * #99 : « aucune facture » couvre DEUX chemins — la facture mono (relation
 * Devis.factures via devisId) ET l'appartenance à une facture récapitulative
 * multi-devis (table de liaison FactureDevis, où devisId n'est pas renseigné).
 * On bloque dès que l'un OU l'autre est non vide. Les deux comptes peuvent se
 * recouvrir pour une facture mono (relation + lien backfillé) — sans impact,
 * la décision ne teste que « > 0 ».
 *
 * La vérification d'appartenance du nouveau client au tenant reste côté route
 * (accès DB) — ce helper ne décide que de la règle métier.
 */
export type ClientChangeDecision =
  | "no-change"        // clientId absent ou identique → rien à faire
  | "allowed"          // changement autorisé
  | "blocked-factures"; // une facture (mono OU récap) existe déjà

export function evaluateClientChange(params: {
  currentClientId: string;
  /** Conservé pour la traçabilité des appelants ; n'influe plus sur la
   *  décision depuis FIX-CLIENT-CHANGE-ENVOYE. */
  currentStatut: DevisStatut;
  /** Nb de factures mono liées via Devis.factures (relation devisId). */
  facturesCount: number;
  /** Nb de liens FactureDevis (facture récap ou mono). Défaut 0 pour les
   *  appelants antérieurs à #99. */
  factureLinksCount?: number;
  newClientId: string | undefined;
}): ClientChangeDecision {
  const {
    currentClientId,
    facturesCount,
    factureLinksCount = 0,
    newClientId,
  } = params;

  if (newClientId === undefined || newClientId === currentClientId) {
    return "no-change";
  }
  if (facturesCount > 0 || factureLinksCount > 0) {
    return "blocked-factures";
  }
  return "allowed";
}
