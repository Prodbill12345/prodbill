/**
 * Sections du DevisBuilder (C-DEVIS-SECTIONS-REORDER) : logique pure,
 * testable, partagée par le builder et la route PUT /api/devis/[id].
 *
 * L'ordre des sections est persisté (DevisSection.ordre) : le payload de
 * sauvegarde numérote les sections dans l'ordre affiché, la route recrée les
 * sections avec cet ordre, et toutes les lectures (builder, fiche, PDF devis,
 * PDF facture) trient par `ordre`. Réordonner = réordonner le tableau.
 *
 * Verrou : une facture lit ses sections EN DIRECT sur le devis source (pas de
 * lignes figées à l'émission, cf. SNAPSHOT-FACTURE-LIGNES). Réordonner le
 * devis d'une facture déjà créée modifierait donc le PDF d'une pièce émise.
 * Même règle que le changement de client (FIX-CLIENT-CHANGE-ENVOYE) : bloqué
 * dès qu'une facture mono OU récap (#99) est liée au devis.
 */

/** Une facture (mono via Devis.factures, ou récap via FactureDevis) existe. */
export function isDevisFactureLocked(params: {
  facturesCount: number;
  factureLinksCount?: number;
}): boolean {
  return params.facturesCount > 0 || (params.factureLinksCount ?? 0) > 0;
}

/** Message de refus : même formulation que pour le changement de client. */
export const SECTIONS_REORDER_BLOCKED_MESSAGE =
  "Impossible de réordonner les sections : une facture a déjà été créée depuis ce devis.";

export type SectionReorderDecision =
  | "no-change" // ordre relatif des sections existantes inchangé
  | "allowed" // réordonnancement autorisé
  | "blocked-factures"; // une facture (mono OU récap) existe déjà

/**
 * Compare l'ordre des sections existantes (ids en base, triés par `ordre`) à
 * l'ordre reçu (`sourceId` de chaque section du payload). Les sections
 * nouvelles (sans sourceId) et supprimées ne comptent pas : seul l'ordre
 * relatif des sections conservées fait foi. Ajouter une section en fin de
 * liste ou en supprimer une n'est donc pas un réordonnancement.
 */
export function evaluateSectionReorder(params: {
  existingSectionIds: string[];
  incomingSourceIds: (string | null | undefined)[];
  facturesCount: number;
  factureLinksCount?: number;
}): SectionReorderDecision {
  const known = new Set(params.existingSectionIds);
  const kept = params.incomingSourceIds.filter(
    (id): id is string => typeof id === "string" && known.has(id)
  );
  const keptSet = new Set(kept);
  const expected = params.existingSectionIds.filter((id) => keptSet.has(id));
  const reordered = kept.some((id, i) => id !== expected[i]);

  if (!reordered) return "no-change";
  return isDevisFactureLocked(params) ? "blocked-factures" : "allowed";
}

/** Déplace l'élément d'index `from` vers `to` (copie, bornes ignorées). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items.slice();
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Le builder mémorise les sections dépliées par index : après un
 * déplacement, l'état déplié doit suivre la section, pas rester à l'index.
 */
export function moveIndexSet(
  indexes: Set<number>,
  length: number,
  from: number,
  to: number
): Set<number> {
  const flags = Array.from({ length }, (_, i) => indexes.has(i));
  const moved = moveItem(flags, from, to);
  return new Set(moved.flatMap((on, i) => (on ? [i] : [])));
}

interface SectionInput<L> {
  sourceId?: string;
  titre?: string;
  lignes: L[];
}

interface LigneInput {
  comedienId?: string | null;
  agentId?: string | null;
  quantite: unknown;
  prixUnit: unknown;
}

/**
 * Payload `sections` envoyé au POST / PUT : `ordre` = position affichée
 * (section et ligne), `sourceId` conservé pour la détection de
 * réordonnancement côté route.
 */
export function buildSectionsPayload<S extends SectionInput<LigneInput>>(sections: S[]) {
  return sections.map((s, si) => ({
    ...s,
    ordre: si,
    lignes: s.lignes.map((l: S["lignes"][number], li) => ({
      ...l,
      // `<select>` HTML envoie "" pour l'option par défaut. On convertit
      // toute valeur falsy ("", null, undefined) en `undefined` pour que
      // optionalFkId côté API la transforme proprement en undefined puis
      // en null Prisma au mapping `?? null`. Envoyer `null` direct est
      // rejeté par le schema Zod (z.string().optional() n'accepte que
      // string|undefined). Voir BUG #3 + régression devis existants.
      comedienId: l.comedienId || undefined,
      agentId: l.agentId || undefined,
      quantite: Number(l.quantite),
      prixUnit: Number(l.prixUnit),
      ordre: li,
    })),
  }));
}
