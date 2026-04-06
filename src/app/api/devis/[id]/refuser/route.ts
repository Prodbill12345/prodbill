import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:accept");
    const { id } = await params;

    const devis = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (devis.statut !== "ENVOYE") {
      return Response.json(
        { error: "Seul un devis envoyé peut être refusé" },
        { status: 400 }
      );
    }

    const updated = await prisma.devis.update({
      where: { id },
      data: { statut: "REFUSE" },
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "DEVIS_REFUSE",
      entityType: "Devis",
      entityId: id,
      devisId: id,
    });

    return Response.json({ data: updated });
  } catch (err) {
    return handleAuthError(err);
  }
}
