/**
 * Objet + description du projet sur la facture (FEAT-FACTURE-OBJET-DESCRIPTION).
 *
 * - Facture mono (acompte/solde) : snapshot de Devis.objet / Devis.description
 *   à la création (snapshotObjetFromDevis), même logique de copie défensive
 *   que la période d'exploitation (chaîne vide/blanche → null).
 * - Facture récap : rien n'est copié (N devis = N objets ; le bloc « Devis
 *   regroupés » porte déjà réf + objet de chaque devis). Saisie manuelle
 *   possible pour un titre global.
 * - Éditables tant que BROUILLON, figés à l'émission (canEditFactureObjet,
 *   partagé route PUT + UI).
 */

/** Chaîne exploitable ou null (absente, vide, blanche). */
export function cleanText(v: string | null | undefined): string | null {
  return v?.trim() || null;
}

export function snapshotObjetFromDevis(devis: {
  objet: string | null;
  description: string | null;
}): { objet: string | null; descriptionProjet: string | null } {
  return {
    objet: cleanText(devis.objet),
    descriptionProjet: cleanText(devis.description),
  };
}

/** Objet/description modifiables : brouillon jamais émis uniquement. */
export function canEditFactureObjet(facture: {
  statut: string;
  emiseAt: Date | string | null;
}): boolean {
  return facture.statut === "BROUILLON" && !facture.emiseAt;
}

/**
 * Décision d'affichage (PDF facture + page) : objet/description propres à la
 * facture, et suffixe de la ligne « Réf. » (objet live du devis) affiché
 * seulement si la facture n'a pas son propre objet — pas de doublon, et
 * rendu inchangé pour les pièces antérieures à la feature.
 */
export function factureObjetDisplay(
  facture: { objet: string | null; descriptionProjet: string | null },
  devisObjetLive: string
): { objet: string | null; description: string | null; refSuffix: string } {
  const objet = cleanText(facture.objet);
  return {
    objet,
    description: cleanText(facture.descriptionProjet),
    refSuffix: objet ? "" : devisObjetLive,
  };
}
