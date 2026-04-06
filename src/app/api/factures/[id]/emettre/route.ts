import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendFactureEmail } from "@/lib/email/resend";

/**
 * POST /api/factures/[id]/emettre
 * Rend la facture IMMUABLE (statut EMISE).
 * Après cette action, aucune modification n'est autorisée (contrainte légale).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:emit");
    const { id } = await params;

    const facture = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
      include: { client: true },
    });

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (facture.statut !== "BROUILLON") {
      return Response.json(
        { error: "Seul un brouillon peut être émis" },
        { status: 400 }
      );
    }

    const now = new Date();
    const dateEcheance =
      facture.dateEcheance ??
      new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000); // +45 jours

    const updated = await prisma.facture.update({
      where: { id },
      data: {
        statut: "EMISE",
        dateEmission: now,
        dateEcheance,
        emiseAt: now, // Marque l'immuabilité
      },
    });

    // Envoyer par email si PDF disponible
    if (facture.pdfUrl) {
      await sendFactureEmail({
        to: facture.client.email,
        clientName: facture.client.name,
        companyName: facture.nomEmetteur,
        factureNumero: facture.numero,
        totalTtc: facture.totalTtc,
        dateEcheance,
        pdfUrl: facture.pdfUrl,
        iban: facture.ibanEmetteur,
        bic: facture.bicEmetteur,
      });
    }

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_EMISE",
      entityType: "Facture",
      entityId: id,
      details: {
        numero: facture.numero,
        totalTtc: facture.totalTtc,
        dateEcheance: dateEcheance.toISOString(),
      },
      factureId: id,
    });

    return Response.json({ data: updated });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
