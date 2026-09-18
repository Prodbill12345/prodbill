/**
 * src/lib/pdf/append-annexes.ts
 *
 * Assemblage pdf-lib des annexes d'un PDF de facture (C-FACTURE-PDF-BDC).
 *
 * Extrait du chemin déjà en production dans /api/factures/[id]/pdf, qui
 * fusionne les "documents joints" société (?docs=) derrière la facture. Les
 * BDC client ajoutent deux besoins que ce chemin ne couvrait pas :
 *   - des annexes IMAGE (JPG/PNG), le BDC étant souvent un scan ;
 *   - une page de mention quand le plafond de poids écarte des annexes.
 *
 * Le format est détecté sur les OCTETS et non sur le nom de fichier : la
 * route d'upload #79 contraint le MIME mais conserve le nom d'origine du
 * client, qui peut très bien n'avoir aucune extension.
 */

import {
  PDFDocument,
  StandardFonts,
  PageSizes,
  rgb,
  type PDFFont,
} from "pdf-lib";

export type AnnexeKind = "pdf" | "jpeg" | "png";

/** Marge des pages générées (mention, images), en points. */
const MARGIN = 40;

/**
 * Détecte le format d'une annexe par ses octets de tête (magic numbers).
 * Retourne NULL si le format n'est pas annexable — au caller de décider
 * (on ignore l'annexe plutôt que de faire échouer tout le PDF).
 */
export function detectAnnexeKind(bytes: Uint8Array): AnnexeKind | null {
  // "%PDF"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "pdf";
  }

  // JPEG : SOI marker FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length >= PNG_SIG.length &&
    PNG_SIG.every((b, i) => bytes[i] === b)
  ) {
    return "png";
  }

  return null;
}

/**
 * Ajoute une annexe au document cible. Retourne le nombre de pages ajoutées
 * (0 si le format n'est pas reconnu — l'annexe est alors silencieusement
 * ignorée, comme le `continue` sur fetch échoué du chemin ?docs=).
 *
 * Un PDF annexé conserve sa pagination d'origine ; une image produit
 * exactement une page A4.
 */
export async function appendAnnexe(
  target: PDFDocument,
  bytes: Uint8Array
): Promise<number> {
  const kind = detectAnnexeKind(bytes);
  if (kind === null) return 0;

  if (kind === "pdf") {
    const source = await PDFDocument.load(bytes);
    const pages = await target.copyPages(source, source.getPageIndices());
    pages.forEach((p) => target.addPage(p));
    return pages.length;
  }

  await appendImageAsPage(target, bytes, kind);
  return 1;
}

/**
 * Ajoute une image en une page A4, centrée, ratio préservé, réduite si
 * nécessaire pour tenir dans les marges. Une image plus petite que la zone
 * utile n'est PAS agrandie : agrandir un scan basse résolution le rendrait
 * illisible.
 */
export async function appendImageAsPage(
  target: PDFDocument,
  bytes: Uint8Array,
  kind: "jpeg" | "png"
): Promise<void> {
  const image =
    kind === "jpeg" ? await target.embedJpg(bytes) : await target.embedPng(bytes);

  const page = target.addPage(PageSizes.A4);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const maxWidth = pageWidth - MARGIN * 2;
  const maxHeight = pageHeight - MARGIN * 2;

  const { width: drawWidth, height: drawHeight } = fitWithin(
    image.width,
    image.height,
    maxWidth,
    maxHeight
  );

  page.drawImage(image, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

/**
 * Dimensions d'une image réduite pour tenir dans une zone, ratio préservé.
 * Jamais d'agrandissement (scale plafonné à 1) : étirer un scan basse
 * résolution le rendrait illisible.
 */
export function fitWithin(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

/**
 * Ajoute une page de mention (titre + paragraphes). Utilisée pour signaler
 * les annexes écartées par le plafond de poids : la mention doit vivre DANS
 * le PDF, sans quoi le destinataire n'a aucun moyen de savoir qu'il manque
 * des pièces.
 */
export async function appendNoticePage(
  target: PDFDocument,
  title: string,
  paragraphs: readonly string[]
): Promise<void> {
  const font = await target.embedFont(StandardFonts.Helvetica);
  const boldFont = await target.embedFont(StandardFonts.HelveticaBold);

  const page = target.addPage(PageSizes.A4);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const maxWidth = pageWidth - MARGIN * 2;

  const titleSize = 14;
  const bodySize = 10;
  const lineHeight = bodySize * 1.5;

  let y = pageHeight - MARGIN - titleSize;
  page.drawText(title, {
    x: MARGIN,
    y,
    size: titleSize,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.12),
  });
  y -= titleSize * 1.8;

  for (const paragraph of paragraphs) {
    for (const line of wrapText(paragraph, font, bodySize, maxWidth)) {
      if (y < MARGIN) return; // Page pleine : on ne déborde pas.
      page.drawText(line, {
        x: MARGIN,
        y,
        size: bodySize,
        font,
        color: rgb(0.25, 0.27, 0.32),
      });
      y -= lineHeight;
    }
    y -= lineHeight * 0.5;
  }
}

/**
 * Découpe un texte en lignes tenant dans `maxWidth`. Un mot plus long que la
 * largeur utile occupe sa propre ligne sans être coupé (on préfère un
 * dépassement rare et lisible à une césure au milieu d'un nom de fichier).
 */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  return lines;
}
