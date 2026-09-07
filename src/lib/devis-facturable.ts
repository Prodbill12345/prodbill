import type { DevisStatut } from "@prisma/client";

/**
 * Un devis est facturable dès qu'il est VALIDÉ en interne par Vanda (#96/#97),
 * ENVOYÉ au client, ou ACCEPTÉ par lui. En pratique (#99) les clients de Vanda
 * n'acceptent pas formellement dans l'app : leurs devis restent ENVOYE, qui est
 * donc un état facturable à part entière. Seul BROUILLON (pas encore émis) et
 * les états terminaux REFUSE/EXPIRE restent non facturables.
 *
 * Source de vérité partagée entre le gate serveur (/api/factures et
 * /api/factures/recap), l'affichage des boutons Acompte/Solde (DevisActions) et
 * la sélection multi-devis de la facture récapitulative — mono et récap ont
 * ainsi exactement la même éligibilité.
 */
export function isDevisFacturable(statut: DevisStatut): boolean {
  return statut === "VALIDE" || statut === "ACCEPTE" || statut === "ENVOYE";
}
