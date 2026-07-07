import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/devis/[id]/valider
 * Ticket #96 — Validation INTERNE d'un devis (Vanda). Passe BROUILLON → VALIDE.
 * Aucun envoi mail, aucune numérotation : c'est un simple feu vert interne
 * qui rend le devis facturable (cf. /api/factures qui accepte {VALIDE, ACCEPTE}).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:send");
    const { id } = await params;

    const devis = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (devis.statut !== "BROUILLON") {
      return Response.json(
        { error: "Seul un brouillon peut être validé" },
        { status: 400 }
      );
    }

    const updated = await prisma.devis.update({
      where: { id },
      data: { statut: "VALIDE" },
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "DEVIS_VALIDE",
      entityType: "Devis",
      entityId: id,
      devisId: id,
    });

    return Response.json({ data: updated });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = "force-dynamic";
