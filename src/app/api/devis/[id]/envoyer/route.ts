import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextDevisNumero } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { sendDevisEmail } from "@/lib/email/resend";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:send");
    const { id } = await params;

    const devis = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
      include: { client: true },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (devis.statut !== "BROUILLON") {
      return Response.json(
        { error: "Seul un brouillon peut être envoyé" },
        { status: 400 }
      );
    }

    // Générer le numéro séquentiel si pas encore attribué
    const numero = devis.numero ?? (await getNextDevisNumero(user.companyId));

    const updated = await prisma.devis.update({
      where: { id },
      data: {
        statut: "ENVOYE",
        numero,
        dateEmission: new Date(),
      },
    });

    // Envoyer l'email si le PDF est disponible
    if (devis.pdfUrl) {
      await sendDevisEmail({
        to: devis.client.email,
        clientName: devis.client.name,
        companyName: user.company.name,
        devisNumero: numero,
        devisObjet: devis.objet,
        totalTtc: devis.totalTtc,
        pdfUrl: devis.pdfUrl,
        expiresAt: devis.dateValidite ?? undefined,
      });
    }

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "DEVIS_ENVOYE",
      entityType: "Devis",
      entityId: id,
      details: { numero, clientEmail: devis.client.email },
      devisId: id,
    });

    return Response.json({ data: updated });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
