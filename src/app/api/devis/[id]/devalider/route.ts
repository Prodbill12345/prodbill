import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/devis/[id]/devalider
 * Ticket #96 — Annule la validation interne. Repasse VALIDE → BROUILLON.
 * Refusé si le devis a déjà des factures (l'annulation créerait une
 * incohérence : une facture pointant vers un brouillon).
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
      include: { _count: { select: { factures: true } } },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (devis.statut !== "VALIDE") {
      return Response.json(
        { error: "Seul un devis validé peut être dévalidé" },
        { status: 400 }
      );
    }

    if (devis._count.factures > 0) {
      return Response.json(
        { error: "Impossible de dévalider : une facture a déjà été créée depuis ce devis" },
        { status: 400 }
      );
    }

    const updated = await prisma.devis.update({
      where: { id },
      data: { statut: "BROUILLON" },
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "DEVIS_DEVALIDE",
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
