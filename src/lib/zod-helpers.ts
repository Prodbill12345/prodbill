/**
 * src/lib/zod-helpers.ts
 *
 * Helpers Zod réutilisables côté API.
 */

import { z } from "zod";

/**
 * FK optionnelle envoyée par un `<select>` HTML. Convertit la chaîne
 * vide "" (option par défaut non sélectionnée) en `undefined`, traité
 * comme `null` au mapping `?? null` côté Prisma.
 *
 * Évite la violation FK Prisma P2003 si la conversion UI a été oubliée.
 * Voir BUG #3.
 */
export const optionalFkId = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));
