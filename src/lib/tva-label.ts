/**
 * Libellé de la ligne TVA à partir d'un taux en POURCENTAGE (20, 10, 5.5, 0).
 *
 *   - 0    → "TVA non applicable"  (franchise en base / hors champ ; la mention
 *            légale, ex "Art. 293 B du CGI", est gérée à part sur le PDF)
 *   - 20   → "TVA 20%"
 *   - 5.5  → "TVA 5,5%"   (virgule décimale française)
 *
 * Source unique du libellé — récap live, page détail, PDF. Le taux lui-même
 * pilote les CALCULS ailleurs (calculerDevis, computeFactureTotalsFromDevis) ;
 * ce helper ne fait que l'affichage.
 */
export function formatTvaLabel(tauxTvaPct: number): string {
  if (tauxTvaPct === 0) return "TVA non applicable";
  const pct =
    tauxTvaPct % 1 === 0
      ? tauxTvaPct.toFixed(0)
      : String(tauxTvaPct).replace(".", ",");
  return `TVA ${pct}%`;
}
