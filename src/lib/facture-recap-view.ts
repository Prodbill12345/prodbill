/**
 * src/lib/facture-recap-view.ts
 *
 * Mise en forme PURE des devis sources d'une facture récapitulative (#99),
 * partagée par le PDF (route pdf + facturx) et la page détail. Garantit une
 * définition unique de « qu'est-ce qu'une récap » et du montant HT affiché par
 * devis, pour que le PDF, le Factur-X et l'écran restent cohérents.
 */

export interface RecapDevisLink {
  devis: {
    id: string;
    numero: string | null;
    objet: string;
    totalHt: number; // HT BRUT du devis (avant remise)
    remise: number;
  };
}

export interface RecapDevisLine {
  id: string;
  numero: string; // stocké nu ("26005") ; "" si brouillon sans numéro
  objet: string;
  montantHt: number; // HT NET facturé pour ce devis = totalHt - remise (arrondi)
}

/**
 * Une facture est récapitulative quand elle n'a pas de devis mono (devisId
 * NULL) mais au moins 2 devis liés via FactureDevis. Une facture mono a
 * exactement 1 lien (backfillé/créé) ET devisId renseigné → non récap.
 */
export function isRecapFacture(devisId: string | null, linkCount: number): boolean {
  return devisId === null && linkCount >= 2;
}

/**
 * Construit la liste des lignes « un devis = une ligne » du récap. Le montant
 * affiché est le HT NET (totalHt - remise) : la somme des lignes reconcilie
 * avec le TOTAL HT net de la facture (Σ totalHt - Σ remise).
 */
export function buildRecapDevisList(links: RecapDevisLink[]): RecapDevisLine[] {
  return links.map((l) => ({
    id: l.devis.id,
    numero: l.devis.numero ?? "",
    objet: l.devis.objet,
    montantHt: Math.round((l.devis.totalHt - l.devis.remise) * 100) / 100,
  }));
}
