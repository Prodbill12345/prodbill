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
 * Filename pour un PDF de devis. Format demandé par Vanda :
 * "DEVIS_{numero}_{objet}.pdf".
 *
 *   - Avec numéro : `DEVIS_${numero}_${slug(objet)}.pdf`
 *   - Brouillon (sans numéro) : `DEVIS_BROUILLON_${slug(objet)}.pdf`
 */
export function devisPdfFilename(devis: {
  id: string;
  numero: string | null;
  objet: string;
}): string {
  const objetSlug = slugify(devis.objet);
  if (devis.numero) {
    const safeNumero = devis.numero.replace(FS_INVALID_CHARS, "-");
    return `DEVIS_${safeNumero}_${objetSlug}.pdf`;
  }
  return `DEVIS_BROUILLON_${objetSlug}.pdf`;
}

/**
 * Filename pour un PDF de facture. Format demandé par Vanda :
 * "FACTURE_{numero}_{objet}.pdf". L'objet provient du devis source
 * (Facture n'a pas de champ `objet` propre).
 *
 *   - Avec devis lié : `FACTURE_${numero}_${slug(devis.objet)}.pdf`
 *   - Sans devis lié (ex avoir manuel) : `FACTURE_${numero}.pdf`
 */
export function facturePdfFilename(facture: {
  numero: string;
  devis?: { objet: string } | null;
}): string {
  const safeNumero = facture.numero.replace(FS_INVALID_CHARS, "-");
  if (facture.devis?.objet) {
    return `FACTURE_${safeNumero}_${slugify(facture.devis.objet)}.pdf`;
  }
  return `FACTURE_${safeNumero}.pdf`;
}
