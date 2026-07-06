import { z } from "zod";

/**
 * Champ email OPTIONNEL, partagé entre les formulaires client (UI) et l'API.
 * Pattern aligné sur le modèle Agent (email facultatif) : soit une adresse
 * valide, soit une chaîne vide, soit absent. Ticket saisie manuelle Vanda —
 * on doit pouvoir créer un client sans email.
 */
export const optionalEmailField = z
  .string()
  .email("Email invalide")
  .optional()
  .or(z.literal(""));

/**
 * Normalise la valeur pour la DB : "" ou undefined → null, sinon l'adresse.
 * (Client.email est nullable côté Prisma depuis la migration
 * client_email_nullable.)
 */
export function normalizeOptionalEmail(
  email: string | null | undefined
): string | null {
  return email ? email : null;
}
