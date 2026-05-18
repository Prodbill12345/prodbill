/**
 * src/lib/pdf-filename.ts
 *
 * Helpers pour construire le nom de fichier des PDF téléchargés.
 *
 * Format cible (demande Vanda) :
 *   - Devis    : "{numero}_{objet}.pdf"  ex "DEV-2026-26089_K-LINE.pdf"
 *   - Facture  : "{numero}_{objet}.pdf"  ex "FAC-2026-26051_K-LINE.pdf"
 *                (objet provient du devis source s'il existe, sinon omis)
 *
 * Slugification :
 *   - Décompose les accents (NFD) puis retire les diacritiques
 *   - Espaces → underscores
 *   - Retire les caractères interdits Windows/macOS : `/ \ : * ? " < > |`
 *   - Collapse les underscores consécutifs et trim les bords
 *   - Tronque à 80 chars max (pour ne pas dépasser les limites FS)
 *   - Si résultat vide → renvoie "untitled"
 */

const MAX_SLUG_LEN = 80;
const FS_INVALID_CHARS = /[\\/?*:"<>|]/g;

export function slugify(input: string | null | undefined): string {
  if (!input) return "untitled";
  const s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")     // diacritiques (combining marks)
    .replace(FS_INVALID_CHARS, "")       // chars interdits FS
    .replace(/\s+/g, "_")                // espaces → _
    .replace(/_+/g, "_")                 // multi-_ → _
    .replace(/^_+|_+$/g, "");            // trim _ aux bords
  if (s === "") return "untitled";
  return s.length > MAX_SLUG_LEN ? s.slice(0, MAX_SLUG_LEN) : s;
}

/**
 * Filename pour un PDF de devis.
 *   - Si numéro existe : `${numero}_${slug(objet)}.pdf`
 *   - Sinon (brouillon) : `devis-brouillon-{id8}_${slug(objet)}.pdf`
 */
export function devisPdfFilename(devis: {
  id: string;
  numero: string | null;
  objet: string;
}): string {
  const objetSlug = slugify(devis.objet);
  if (devis.numero) {
    return `${devis.numero}_${objetSlug}.pdf`;
  }
  return `devis-brouillon-${devis.id.slice(0, 8)}_${objetSlug}.pdf`;
}

/**
 * Filename pour un PDF de facture. L'objet provient du devis source
 * (Facture n'a pas de champ `objet` propre).
 *   - Avec devis lié : `${numero}_${slug(devis.objet)}.pdf`
 *   - Sans devis lié : `${numero}.pdf` (ex avoir manuel)
 */
export function facturePdfFilename(facture: {
  numero: string;
  devis?: { objet: string } | null;
}): string {
  // Le numéro peut contenir "/" sur certaines conventions (legacy).
  // On le slugifie aussi par sécurité — la plupart des numéros
  // restent inchangés (ex "FAC-2026-0001" → "FAC-2026-0001").
  const safeNumero = facture.numero.replace(FS_INVALID_CHARS, "-");
  if (facture.devis?.objet) {
    return `${safeNumero}_${slugify(facture.devis.objet)}.pdf`;
  }
  return `${safeNumero}.pdf`;
}
