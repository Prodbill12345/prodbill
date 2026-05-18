/**
 * src/lib/list-sort.ts
 *
 * Tri générique de listes côté client, réutilisé par /devis et /factures.
 * Convention :
 *   - Cycle ASC → DESC → reset (default sort) au clic répété sur la même colonne
 *   - Cliquer une autre colonne → ASC sur celle-ci (le sort précédent est remplacé)
 *   - Nulls toujours en dernier (en ASC ET en DESC) — convention prévisible vs
 *     SQL standard qui les place différemment selon le sens
 *   - URL state : ?sort=key&order=asc|desc. Absent → default sort appliqué.
 */

export type SortOrder = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  order: SortOrder;
}

export type SortAccessor<T> = (item: T) => string | number | Date | null | undefined;

/**
 * Trie une copie de `list` selon `sort` (ou `defaultSort` si null).
 * Comparateur stable :
 *   - null / undefined toujours en fin (ASC et DESC)
 *   - Date → compare via getTime()
 *   - number → soustraction
 *   - string → localeCompare français, mode numeric (DEV-2026-26010 < DEV-2026-26100)
 */
export function sortBy<T, K extends string>(
  list: T[],
  sort: SortState<K> | null,
  accessors: Record<K, SortAccessor<T>>,
  defaultSort: SortState<K>
): T[] {
  const active = sort ?? defaultSort;
  const accessor = accessors[active.key];
  if (!accessor) return list;

  const dir = active.order === "asc" ? 1 : -1;
  const out = [...list];
  out.sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    const aIsNull = va === null || va === undefined;
    const bIsNull = vb === null || vb === undefined;
    if (aIsNull && bIsNull) return 0;
    if (aIsNull) return 1;
    if (bIsNull) return -1;
    if (va instanceof Date && vb instanceof Date) {
      return (va.getTime() - vb.getTime()) * dir;
    }
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), "fr", { numeric: true }) * dir;
  });
  return out;
}

/**
 * Sérialise un sort state en URLSearchParams (ou vide si null).
 */
export function sortToParams(sort: SortState<string> | null): URLSearchParams {
  const p = new URLSearchParams();
  if (sort) {
    p.set("sort", sort.key);
    p.set("order", sort.order);
  }
  return p;
}

/**
 * Parse les paramètres URL sort/order, en validant la clé contre
 * une liste autorisée et l'ordre en "asc"|"desc". Si invalide → null
 * (le caller appliquera son default).
 */
export function paramsToSort<K extends string>(
  p: URLSearchParams | { get: (k: string) => string | null },
  validKeys: readonly K[]
): SortState<K> | null {
  const key = p.get("sort");
  const order = p.get("order");
  if (!key || !order) return null;
  if (order !== "asc" && order !== "desc") return null;
  if (!(validKeys as readonly string[]).includes(key)) return null;
  return { key: key as K, order: order as SortOrder };
}

/**
 * Calcule l'état suivant pour le cycle ASC → DESC → reset.
 *
 *   handleClick(state, "totalTtc")
 *     - state=null            → { totalTtc, asc }
 *     - { totalTtc, asc }     → { totalTtc, desc }
 *     - { totalTtc, desc }    → null (reset)
 *     - { autre, asc/desc }   → { totalTtc, asc }  (changement de colonne)
 */
export function nextSortState<K extends string>(
  current: SortState<K> | null,
  clickedKey: K
): SortState<K> | null {
  if (!current || current.key !== clickedKey) {
    return { key: clickedKey, order: "asc" };
  }
  if (current.order === "asc") return { key: clickedKey, order: "desc" };
  return null; // reset
}
