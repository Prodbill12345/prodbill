/**
 * Gras dans la description du projet (C-DESCRIPTION-GRAS, 02/11/2026).
 *
 * Format stocké : texte brut où `**mot**` signifie « mot en gras » (sous-ensemble
 * minimal de Markdown). Pas de HTML, rien d'autre que le gras : le texte reste
 * sûr partout (pas d'injection possible) et lisible tel quel. Règles :
 *   - `**…**` avec au moins un caractère entre les marqueurs → gras (le gras
 *     peut couvrir plusieurs lignes) ;
 *   - un `**` sans fermeture, `****` vide ou une `*` isolée restent du texte.
 * Stocké dans Devis.description et copié tel quel dans Facture.descriptionProjet.
 */

export interface TextSegment {
  text: string;
  bold: boolean;
}

const BOLD = /\*\*([\s\S]+?)\*\*/g;

/** Découpe un texte en segments normal / gras, dans l'ordre. */
export function parseBold(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), bold: false });
    segments.push({ text: m[1], bold: true });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments;
}

/** Texte brut, marqueurs retirés (XML Factur-X, sorties texte). */
export function stripBold(text: string): string {
  return text.replace(BOLD, "$1");
}

/** Le texte contient-il au moins un passage en gras ? */
export function hasBold(text: string): boolean {
  return parseBold(text).some((s) => s.bold);
}

export interface BoldEdit {
  /** Plage du texte d'origine à remplacer… */
  replaceStart: number;
  replaceEnd: number;
  /** …par ce texte. */
  insert: string;
  /** Sélection à rétablir après remplacement. */
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Bouton B / Ctrl+B : met la sélection en gras, ou la retire si elle l'est
 * déjà. Renvoie une édition (plage à remplacer + sélection finale) plutôt
 * qu'un nouveau texte, pour que l'appelant passe par l'insertion native du
 * navigateur (annulation Ctrl+Z conservée).
 */
export function toggleBold(value: string, start: number, end: number): BoldEdit {
  // Sélection vide : insère « **** » et place le curseur au milieu.
  if (start === end) {
    return { replaceStart: start, replaceEnd: end, insert: "****", selectionStart: start + 2, selectionEnd: start + 2 };
  }

  // Espaces en bord de sélection (double-clic sur un mot) laissés hors du gras.
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  if (start === end) {
    return { replaceStart: start, replaceEnd: end, insert: "", selectionStart: start, selectionEnd: end };
  }
  const selected = value.slice(start, end);

  // Sélection qui inclut ses marqueurs : « **mot** » → « mot ».
  if (selected.length > 4 && selected.startsWith("**") && selected.endsWith("**")) {
    const inner = selected.slice(2, -2);
    return { replaceStart: start, replaceEnd: end, insert: inner, selectionStart: start, selectionEnd: start + inner.length };
  }

  // Sélection entourée de marqueurs : « **[mot]** » → « mot ».
  if (value.slice(start - 2, start) === "**" && value.slice(end, end + 2) === "**") {
    return {
      replaceStart: start - 2,
      replaceEnd: end + 2,
      insert: selected,
      selectionStart: start - 2,
      selectionEnd: start - 2 + selected.length,
    };
  }

  // Cas général : on entoure.
  return {
    replaceStart: start,
    replaceEnd: end,
    insert: `**${selected}**`,
    selectionStart: start + 2,
    selectionEnd: end + 2,
  };
}

/** Applique une édition à une chaîne (tests, repli sans DOM). */
export function applyBoldEdit(value: string, edit: BoldEdit): string {
  return value.slice(0, edit.replaceStart) + edit.insert + value.slice(edit.replaceEnd);
}
