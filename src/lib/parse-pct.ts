/**
 * src/lib/parse-pct.ts
 *
 * Parsing tolérant des saisies de pourcentages côté UI.
 *
 * Convention :
 *   - L'UI exprime les taux en POURCENTAGE entier ou décimal (ex : `5`, `5,5`, `15`)
 *   - La DB stocke en DÉCIMAL (ex : `0.05`, `0.055`, `0.15`)
 *   - Les helpers `decimalToPct` / `pctToDecimal` font le pont
 *
 * Sur "" / valeur invalide : retourne `null`. Le caller distingue
 * explicitement "absence de valeur" (null) de "zéro légitime" (0).
 */

/**
 * Parse une saisie utilisateur en pourcentage.
 * Accepte virgule ET point, ignore espaces.
 *
 * Exemples :
 *   "5"     → 5
 *   "5,5"   → 5.5
 *   "5.5"   → 5.5
 *   " 5 "   → 5
 *   "0"     → 0           (zéro légitime)
 *   "100"   → 100
 *   "-1"    → -1          (parsing OK ; validation 0..100 séparée)
 *   "101"   → 101         (idem)
 *   ""      → null        (absence de valeur)
 *   "   "   → null
 *   "abc"   → null
 *   "5x"    → 5           (parseFloat tolère le suffixe — connu)
 *   undefined → null
 *   null    → null
 *   5       → 5           (passthrough number)
 */
export function parsePctInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Vérifie qu'une valeur parsée est dans la borne [0, 100]. */
export function isValidPct(n: number | null): n is number {
  return n !== null && Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * Convertit un taux stocké en décimal (0..1) vers son affichage UI en
 * pourcentage (0..100). Arrondi à 2 décimales pour éviter les artefacts
 * flottants (0.05 × 100 = 5.000000000001 → 5).
 *
 *   decimalToPct(0.05)  → 5
 *   decimalToPct(0.055) → 5.5
 *   decimalToPct(0.15)  → 15
 *   decimalToPct(0)     → 0
 */
export function decimalToPct(d: number): number {
  return Math.round(d * 10000) / 100;
}

/**
 * Convertit un pourcentage UI (0..100) vers son stockage décimal (0..1).
 * Arrondi à 4 décimales (10 000ᵉ) pour préserver des taux du type 5.55 %.
 *
 *   pctToDecimal(5)    → 0.05
 *   pctToDecimal(5.5)  → 0.055
 *   pctToDecimal(15)   → 0.15
 *   pctToDecimal(100)  → 1
 */
export function pctToDecimal(p: number): number {
  return Math.round(p * 100) / 10000;
}
