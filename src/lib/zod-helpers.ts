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
