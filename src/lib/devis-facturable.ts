import type { DevisStatut } from "@prisma/client";

/**
 * Un devis est facturable dès qu'il est VALIDÉ en interne par Vanda (#96/#97)
 * ou ACCEPTÉ par le client. Source de vérité partagée entre le gate serveur
 * (/api/factures) et l'affichage des boutons Acompte/Solde (DevisActions).
 */
export function isDevisFacturable(statut: DevisStatut): boolean {
  return statut === "VALIDE" || statut === "ACCEPTE";
}
