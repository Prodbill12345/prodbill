/**
 * Bloc TVA (ram:ApplicableTradeTax) du XML Factur-X — FIX-FACTURX-TVA.
 *
 * Avant : catégorie E / taux 0 % codés en dur, alors que CalculatedAmount
 * portait la TVA réelle (20 % en général) → XML incohérent avec le PDF.
 *
 * Désormais dérivé des snapshots de la facture :
 *   - tauxTva > 0 → catégorie S (taux normal/réduit), taux réel, pas de motif.
 *   - tauxTva = 0 → catégorie E, motif = la mention TVA affichée sur le PDF
 *     (tvaMention ou, à défaut, « Art. 293 B du CGI » — même fallback que
 *     FacturePdf).
 *
 * Limite connue : tvaMention est un texte libre, on ne distingue pas
 * autoliquidation (AE), livraison intracom (K) ou export (G) — tout taux 0
 * part en E. Le mapping fin des catégories relève de CONFORMITE-2027.
 */

export const DEFAULT_TVA_MENTION = "Art. 293 B du CGI";

export function buildFacturxTaxBlock(params: {
  tauxTva: number;
  tva: number;
  totalHt: number;
  tvaMention: string | null;
}): string {
  const { tauxTva, tva, totalHt, tvaMention } = params;
  const fmt = (n: number) => n.toFixed(2);
  const exempt = tauxTva === 0;
  const reason = exempt ? (tvaMention?.trim() || DEFAULT_TVA_MENTION) : null;

  // Ordre des éléments imposé par le XSD CII (TradeTaxType).
  return `<ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(tva)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${
          reason ? `\n        <ram:ExemptionReason>${escapeXml(reason)}</ram:ExemptionReason>` : ""
        }
        <ram:BasisAmount>${fmt(totalHt)}</ram:BasisAmount>
        <ram:CategoryCode>${exempt ? "E" : "S"}</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmt(tauxTva)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Mention « Factur-X » en pied du PDF classique : uniquement sur une pièce
 * émise (numérotée, #98) — un brouillon n'a pas de Factur-X (la route le
 * refuse). Pas de profil cité tant que le XML n'est pas EN 16931
 * (CONFORMITE-2027).
 */
export function facturxMention(facture: {
  numero: string | null;
  type: string;
}): string | null {
  if (!facture.numero) return null;
  const piece = facture.type === "AVOIR" ? "Avoir" : "Facture";
  return `${piece} disponible au format Factur-X`;
}
