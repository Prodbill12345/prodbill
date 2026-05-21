/**
 * DELETE /api/invitations/[id]
 *
 * Révocation d'une invitation. Soft-delete via revokedAt — la ligne reste
 * en DB pour l'historique. Effet : le token devient inutilisable (le check
 * `revokedAt IS NULL` côté accept route refuse le clic).
 *
 * Authz : tout membre de la company peut révoquer. Une invitation déjà
 * acceptée ne peut plus être révoquée (utiliser la révocation de Membership
 * à la place — sera fait en C3).
 */

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const invitation = await prisma.invitation.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation) {
      return Response.json({ error: "Invitation introuvable" }, { status: 404 });
    }
    if (invitation.acceptedAt) {
      return Response.json(
        {
          error:
            "Cette invitation a déjà été acceptée — révoquez le membre depuis la liste des membres.",
        },
        { status: 409 }
      );
    }
    if (invitation.revokedAt) {
      // Idempotent : déjà révoqué, on retourne success.
      return Response.json({ success: true, alreadyRevoked: true });
    }

    await prisma.invitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
