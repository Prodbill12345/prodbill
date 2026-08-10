/**
 * Affichage du numéro de facture (#98). Le numéro est stocké nu ("26005") ;
 * le préfixe "F" est ajouté ici, comme le "D" des devis — jamais stocké.
 *
 *   - brouillon (numero null)        → "Brouillon"
 *   - avoir (numero "AV-<source>")   → tel quel (déjà préfixé)
 *   - facture normale ("26005")      → "F26005"
 *
 * Un futur type AVOIR à préfixe "A" + Counter dédié s'ajoutera ici (mapping
 * par type), sans toucher les appelants.
 */
export function formatFactureNumero(facture: {
  numero: string | null;
}): string {
  const n = facture.numero;
  if (!n) return "Brouillon";
  if (n.startsWith("AV-")) return n;
  return `F${n}`;
}

/**
 * Variante « système de fichiers » pour les noms de PDF : pas de "Brouillon"
 * traduit, on renvoie un token stable et sûr. Le nettoyage des caractères
 * interdits reste à la charge de l'appelant (pdf-filename).
 */
export function factureNumeroForFilename(facture: {
  numero: string | null;
}): string {
  return facture.numero ?? "BROUILLON";
}
