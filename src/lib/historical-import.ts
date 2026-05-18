/**
 * src/lib/historical-import.ts
 *
 * Détection d'un devis issu de l'import historique Caleson — pour le
 * garde-fou banner qui prévient l'utilisateur que les composantes
 * FG/Marge peuvent ne pas correspondre aux taux affichés (cf. BUG #4).
 *
 * Cause : `scripts/import-historique.ts` a uniformisé les taux à
 * `Company.defaultTaux*` pour tous les devis Caleson, et stocké les
 * composantes (`fraisGeneraux`, `marge`) à des valeurs ne dérivant
 * pas mécaniquement de ces taux. Conséquence : `Devis.tauxFg ×
 * Devis.baseMarge ≠ Devis.fraisGeneraux` sur ~328 devis Caleson.
 *
 * Tant que ces devis n'ont pas été réparés (script
 * `scripts/restore-devis-taux.ts` en attente des vrais taux fournis
 * par Vanda), tout enregistrement via PUT /api/devis/[id] recalcule
 * les composantes à partir des taux *affichés* (faux) et peut
 * écraser silencieusement les valeurs d'origine du PDF source.
 *
 * D'où le warning visuel — pas de blocage technique, juste un
 * panneau orange visible avant le formulaire pour que
 * l'utilisateur s'arrête.
 */

/**
 * Date de coupure observée pour l'import Caleson. Tout devis Caleson
 * créé AVANT cette date avec `updatedAt == createdAt` est considéré
 * comme issu de l'import historique non encore corrigé.
 *
 * Note : l'utilisateur a initialement écrit "2026-04-15" dans la spec
 * du garde-fou, mais le diag du devis 26089 K-LINE (le cas remonté
 * par Vanda) montre `createdAt = 2026-05-11T17:37:28Z`. La fenêtre
 * d'import est donc plutôt mai 2026. La date est volontairement
 * post-import + 2 jours pour absorber tout devis créé pendant la
 * fenêtre d'import sans en exclure le 26089. À ajuster si la date
 * exacte d'import est confirmée.
 */
export const CALESON_HISTORICAL_IMPORT_BEFORE = new Date(
  "2026-05-13T00:00:00.000Z"
);

/**
 * Nom de la company concernée. Caleson est le seul tenant impacté
 * (NONNA et futurs clients ne sont pas concernés — vérifié dans
 * `scripts/audit-devis-totalht.ts` : 0 devis NONNA corrompu).
 *
 * TODO : si d'autres tenants sont importés un jour avec le même
 * bug, généraliser via une colonne `Company.historicalImportAt`
 * stockée en DB plutôt que via cette constante hardcodée.
 */
export const HISTORICAL_IMPORT_COMPANY_NAME = "Caleson";

/**
 * Tolérance d'écart entre `createdAt` et `updatedAt` (en ms) pour
 * considérer qu'un devis n'a jamais été modifié. 1 seconde absorbe
 * un éventuel décalage transactionnel infime entre les deux
 * timestamps mais reste largement en-dessous de toute modification
 * réelle (qui prend forcément plusieurs secondes pour le user).
 */
const UNTOUCHED_DRIFT_MS = 1000;

interface DevisLike {
  createdAt: Date;
  updatedAt: Date;
}

interface CompanyLike {
  name: string;
}

/**
 * Renvoie `true` si le devis est un import historique Caleson non
 * encore touché — c'est-à-dire que ses composantes FG/Marge peuvent
 * ne pas correspondre aux taux affichés.
 *
 * Conditions cumulatives :
 *   - Company name == "Caleson"
 *   - createdAt antérieur à `CALESON_HISTORICAL_IMPORT_BEFORE`
 *   - updatedAt === createdAt (à 1 seconde près)
 *
 * À utiliser côté server (page SSR `/devis/[id]/modifier`) pour
 * calculer un boolean propagé au client.
 */
export function isHistoricalImport(
  devis: DevisLike,
  company: CompanyLike
): boolean {
  if (company.name !== HISTORICAL_IMPORT_COMPANY_NAME) return false;
  if (devis.createdAt.getTime() >= CALESON_HISTORICAL_IMPORT_BEFORE.getTime())
    return false;
  const drift = Math.abs(
    devis.updatedAt.getTime() - devis.createdAt.getTime()
  );
  return drift <= UNTOUCHED_DRIFT_MS;
}
