import {
  pdfAccents,
  DEFAULT_PDF_ACCENT,
  type PdfAccentKey,
} from "@/design/tokens";

/**
 * Résolution de l'accent des PDF (C-PDF-ACCENT-PAR-COMPANY).
 *
 * - Devis et facture BROUILLON : réglage actuel de la société
 *   (Company.pdfAccent, NULL = Majorelle).
 * - Facture émise : accent figé à l'émission (Facture.pdfAccent). Changer le
 *   réglage ensuite ne recolore pas une pièce émise ; une pièce émise avant
 *   la fonctionnalité (snapshot NULL) reste en Majorelle.
 * Toute valeur inconnue retombe sur Majorelle (jamais d'erreur de rendu).
 */

export function toPdfAccentKey(value: string | null | undefined): PdfAccentKey {
  return value && Object.prototype.hasOwnProperty.call(pdfAccents, value)
    ? (value as PdfAccentKey)
    : DEFAULT_PDF_ACCENT;
}

export function resolveDevisPdfAccent(companyAccent: string | null | undefined): PdfAccentKey {
  return toPdfAccentKey(companyAccent);
}

export function resolveFacturePdfAccent(
  facture: { emiseAt?: Date | string | null; pdfAccent?: string | null },
  companyAccent: string | null | undefined
): PdfAccentKey {
  return facture.emiseAt ? toPdfAccentKey(facture.pdfAccent) : toPdfAccentKey(companyAccent);
}

/** Couleurs à appliquer aux 4 usages de l'accent dans un PDF. */
export function pdfAccentColors(key: PdfAccentKey | null | undefined) {
  const a = pdfAccents[toPdfAccentKey(key)];
  return { accent: a.accent, accentInk: a.accentInk };
}
