import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextBDCNumero } from "@/lib/numbering";
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
        { error: "Seul un devis envoyé peut être accepté" },
        { status: 400 }
      );
    }

    if (!devis.numero) {
      return Response.json({ error: "Numéro de devis manquant" }, { status: 400 });
    }

    // Générer le BDC en même temps
    const bdcNumero = await getNextBDCNumero(user.companyId, devis.numero);

    const [updatedDevis] = await prisma.$transaction([
      prisma.devis.update({
        where: { id },
        data: { statut: "ACCEPTE" },
      }),
      prisma.bDC.create({
        data: {
          devisId: id,
          numero: bdcNumero,
        },
      }),
    ]);

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "DEVIS_ACCEPTE",
      entityType: "Devis",
      entityId: id,
      details: { bdcNumero },
      devisId: id,
    });

    return Response.json({ data: { devis: updatedDevis, bdcNumero } });
  } catch (err) {
    return handleAuthError(err);
  }
}
