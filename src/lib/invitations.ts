/**
 * src/lib/invitations.ts
 *
 * Helpers PURS pour le flow d'invitations (Phase 2 multi-user).
 * Extraits des routes API pour permettre des tests unitaires sans mock
 * lourd de Prisma + Clerk.
 */

import type { Prisma } from "@prisma/client";

/**
 * Construit le filtre Prisma pour les invitations PENDING d'une company :
 *   - non acceptées (acceptedAt IS NULL)
 *   - non révoquées (revokedAt IS NULL)
 *   - non expirées (expiresAt > now)
 *
 * Pour récupérer l'historique complet (UI "invitations passées"), passer
 * par un endpoint séparé ou un query param ?include=all (pas en V1).
 */
export function pendingInvitationsWhere(
  companyId: string,
  now: Date = new Date()
): Prisma.InvitationWhereInput {
  return {
    companyId,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: { gt: now },
  };
}

export type InvitationAcceptError =
  | { ok: true }
  | { ok: false; status: number; message: string };

interface InvitationStateForCheck {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * Vérifie qu'une invitation est dans un état acceptable pour acceptation.
 * Renvoie { ok: true } ou un objet d'erreur avec status HTTP + message.
 *
 * Codes utilisés (cf. spec) :
 *   - 409 Conflict : déjà acceptée (état "définitif")
 *   - 410 Gone    : révoquée ou expirée (la ressource a disparu)
 *
 * L'email mismatch n'est PAS dans ce helper : il dépend du contexte Clerk
 * et reste vérifié directement dans la route.
 */
export function checkInvitationAcceptable(
  invitation: InvitationStateForCheck,
  now: Date = new Date()
): InvitationAcceptError {
  if (invitation.acceptedAt) {
    return {
      ok: false,
      status: 409,
      message: "Cette invitation a déjà été acceptée.",
    };
  }
  if (invitation.revokedAt) {
    return {
      ok: false,
      status: 410,
      message: "Cette invitation a été annulée.",
    };
  }
  if (invitation.expiresAt < now) {
    return {
      ok: false,
      status: 410,
      message: "Cette invitation a expiré.",
    };
  }
  return { ok: true };
}
