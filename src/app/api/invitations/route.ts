/**
 * src/app/api/invitations/route.ts
 *
 * Routes invitations Phase 2 (suite #69) — C2/4.
 *
 *   GET  /api/invitations  → liste des invitations de la company de l'user
 *                            (toutes : pending + acceptées + révoquées,
 *                             pour pouvoir afficher l'historique)
 *   POST /api/invitations  → crée une invitation + envoie l'email Resend
 *
 * Toute personne authentifiée membre de la company peut inviter (V1 : pas
 * de notion d'ADMIN du workspace, n'importe quel MEMBER peut inviter).
 */

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendInvitationEmail } from "@/lib/email/resend";
import { pendingInvitationsWhere } from "@/lib/invitations";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const InviteSchema = z.object({
  email: z.string().email("Email invalide").transform((v) => v.trim().toLowerCase()),
});

/** Durée de validité d'un token d'invitation (7 jours). */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const user = await requireAuth();

    // V1 : on ne retourne que les invitations PENDING (non acceptées,
    // non révoquées, non expirées). L'historique des invitations passées
    // pourra être exposé via un endpoint séparé ou un query param
    // ?include=all en C3 si l'UI en a besoin. Voir helper pour les
    // critères exacts.
    const invitations = await prisma.invitation.findMany({
      where: pendingInvitationsWhere(user.companyId),
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data: invitations });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const input = InviteSchema.parse(body);

    // 1. L'email correspond-il déjà à un membre actif ?
    const existingMember = await prisma.membership.findFirst({
      where: {
        companyId: user.companyId,
        user: { email: input.email },
        revokedAt: null,
        joinedAt: { not: null },
      },
      select: { id: true },
    });
    if (existingMember) {
      return Response.json(
        { error: "Cette personne est déjà membre du workspace." },
        { status: 409 }
      );
    }

    // 2. Une invitation pending existe-t-elle déjà pour cet email ?
    // Réutilise le même helper que GET → cohérence garantie entre
    // "ce que GET retourne" et "ce qui bloque une nouvelle invitation".
    const existingInvitation = await prisma.invitation.findFirst({
      where: { ...pendingInvitationsWhere(user.companyId), email: input.email },
      select: { id: true, expiresAt: true },
    });
    if (existingInvitation) {
      return Response.json(
        {
          error: "Une invitation est déjà active pour cet email.",
          existingId: existingInvitation.id,
          expiresAt: existingInvitation.expiresAt,
        },
        { status: 409 }
      );
    }

    // 3. Création de l'invitation
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await prisma.invitation.create({
      data: {
        email: input.email,
        companyId: user.companyId,
        invitedByUserId: user.id,
        token,
        expiresAt,
      },
    });

    // 4. Envoi du mail. Si Resend échoue, on garde l'invitation en DB et
    // log l'erreur — l'inviteur pourra retenter via "Renvoyer". Voir spec
    // edge cases.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const acceptUrl = `${appUrl}/invitations/accept?token=${encodeURIComponent(token)}`;

    let emailResult: Awaited<ReturnType<typeof sendInvitationEmail>> | null = null;
    let emailError: string | null = null;
    try {
      emailResult = await sendInvitationEmail({
        to: input.email,
        inviterName: user.name,
        companyName: user.company.name,
        acceptUrl,
        expiresAt,
        accentColor: user.company.primaryColor ?? undefined,
      });
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[POST /api/invitations] Resend échec :", emailError);
    }

    return Response.json(
      {
        data: {
          ...invitation,
          email: {
            sent: !emailError && !emailResult?.skipped,
            ...emailResult,
            error: emailError,
          },
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "Données invalides", details: err.issues },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
