/**
 * Normalisation Unicode NFC des données affichées dans les PDF.
 *
 * Certains textes sont stockés en forme décomposée (NFD : « e » + U+0301
 * au lieu de « é »), typiquement collés depuis macOS. react-pdf ne
 * positionne pas les diacritiques combinants : l'accent sort détaché
 * (« come ́diens »). NFC recompose « é » en un seul caractère.
 *
 * Affichage uniquement : les données en base ne sont pas modifiées.
 * Parcours récursif des objets simples et tableaux ; les Date et autres
 * instances (non « plain objects ») sont rendues telles quelles.
 */
export function normalizeNfcDeep<T>(value: T): T {
  if (typeof value === "string") return value.normalize("NFC") as T;
  if (Array.isArray(value)) return value.map(normalizeNfcDeep) as T;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalizeNfcDeep(v)])
    ) as T;
  }
  return value;
}
