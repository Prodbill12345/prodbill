/**
 * src/lib/zod-helpers.ts
 *
 * Helpers Zod réutilisables côté API.
 */

import { z } from "zod";

/**
 * FK optionnelle envoyée par un `<select>` HTML. Convertit la chaîne
 * vide "" (option par défaut non sélectionnée) ET `null` en `undefined`,
 * traité comme `null` au mapping `?? null` côté Prisma.
 *
 * Accepte donc en entrée : string non-vide, string vide, null, undefined.
 * Sort : string non-vide OU undefined. Le caller fait `?? null` pour Prisma.
 *
 * Évite la violation FK Prisma P2003 si la conversion UI a été oubliée.
 * Voir BUG #3 (commit 6ccfd4b) et sa régression sur les devis existants
 * où un caller envoyait `null` (rejeté par l'ancien schema).
 */
export const optionalFkId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === null ? undefined : v));

/**
 * Champs Zod pour la période d'exploitation (ticket #69).
 * À étaler dans un schéma de devis (client ou API) :
 *   const Schema = z.object({ ...autres, ...periodeExploitationFields })
 *     .superRefine(validatePeriodeExploitation);
 *
 * Les dates sont reçues en string "YYYY-MM-DD" depuis `<input type="date">`
 * (même pattern que dateEmission/dateValidite/dateSeance), parsées en Date
 * côté API au moment du prisma.create/update.
 */
export const periodeExploitationFields = {
  periodeExploitationDebut: z.string().optional().nullable(),
  periodeExploitationFin: z.string().optional().nullable(),
  periodeExploitationLibelle: z
    .string()
    .max(255, "Libellé max 255 caractères")
    .optional()
    .nullable(),
};

/**
 * Règles métier de validation croisée :
 *   - Si Fin saisie, Début doit l'être aussi (et inversement) — pas de
 *     date orpheline.
 *   - Si les 2 dates sont saisies : Fin >= Début (égalité OK pour une
 *     exploitation d'une journée).
 *   - Libellé seul (sans dates) = autorisé (cas "à définir").
 *   - Tout vide = autorisé (pas de droits, ex: prestation tech seule).
 *
 * À passer à `.superRefine()` du schéma parent.
 */
export function validatePeriodeExploitation(
  data: {
    periodeExploitationDebut?: string | null;
    periodeExploitationFin?: string | null;
  },
  ctx: z.RefinementCtx
): void {
  const d = data.periodeExploitationDebut?.trim() || "";
  const f = data.periodeExploitationFin?.trim() || "";

  if (d && !f) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date de fin manquante (saisir les deux dates ou aucune)",
      path: ["periodeExploitationFin"],
    });
  }
  if (f && !d) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date de début manquante (saisir les deux dates ou aucune)",
      path: ["periodeExploitationDebut"],
    });
  }
  if (d && f) {
    // Comparaison sur la string "YYYY-MM-DD" — l'ordre lexico === l'ordre
    // chronologique pour ce format. Évite la création de Date qui peut
    // varier selon le fuseau.
    if (f < d) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La date de fin doit être après la date de début",
        path: ["periodeExploitationFin"],
      });
    }
  }
}
