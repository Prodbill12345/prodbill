import type { DevisStatut, FactureStatut } from "@prisma/client";
import type { StatusTone } from "./tokens";

/**
 * Statut métier → ton de badge (C-REDESIGN-PHASE2-APP). Les libellés restent
 * ceux de src/types (DEVIS_STATUT_LABELS / FACTURE_STATUT_LABELS) : la
 * sémantique ne change pas, seule la couleur suit la DA.
 * Validé (interne) et Accepté (client) restent distincts (#96).
 */
export const DEVIS_STATUT_TONE: Record<DevisStatut, StatusTone> = {
  BROUILLON: "neutral",
  VALIDE: "validated",
  ENVOYE: "info",
  ACCEPTE: "success",
  REFUSE: "danger",
  EXPIRE: "muted",
};

export const FACTURE_STATUT_TONE: Record<FactureStatut, StatusTone> = {
  BROUILLON: "neutral",
  EMISE: "info",
  PAYEE_PARTIEL: "partial",
  PAYEE: "success",
  EN_RETARD: "danger",
  ANNULEE: "danger",
};
