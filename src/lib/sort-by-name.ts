/**
 * Tri alphabétique français d'une liste par une clé texte, pour les listes
 * déroulantes de sélection (Client / Agent / Comédien).
 *
 * Utilise localeCompare("fr") avec sensitivity "base" : l'ordre gère
 * correctement les accents (é, è, à…) et ignore la casse — "Élodie" se
 * classe à sa place attendue, pas après "Z". Ne mute pas la liste d'entrée.
 */
export function sortByLabelFr<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) =>
    getLabel(a).localeCompare(getLabel(b), "fr", { sensitivity: "base" })
  );
}
