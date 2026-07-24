/**
 * Visibilité des lignes du récapitulatif d'un DEVIS (affichage + PDF).
 *
 * Certaines sociétés (ex : NONNA) préfèrent ne montrer que le Total HT sur
 * leurs devis — leurs clients trouvent le TTC "choquant". On masque alors la
 * ligne TVA ET la ligne Total TTC. Le Total HT reste toujours visible.
 *
 * ⚠️ N'affecte QUE les devis. Les FACTURES gardent toujours TVA + TTC
 * (obligation légale / compta) — ce helper n'y est pas branché.
 * ⚠️ Pur affichage : aucun calcul serveur n'est modifié, les montants
 * restent en base.
 */
export interface DevisRecapVisibility {
  showTva: boolean;
  showTtc: boolean;
}

export function devisRecapVisibility(company: {
  hideTvaTtcOnDevis: boolean;
}): DevisRecapVisibility {
  const hide = company.hideTvaTtcOnDevis === true;
  return { showTva: !hide, showTtc: !hide };
}
