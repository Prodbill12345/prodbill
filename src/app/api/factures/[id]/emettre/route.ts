import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getNextFactureNumero } from "@/lib/numbering";
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

    // #98 : le numéro définitif est attribué ICI (à l'émission), tiré du
    // Counter FACTURE de façon atomique, puis posé EN MÊME TEMPS que emiseAt
    // (évite le legacy emiseAt=null, cf. fix 3bfcbc0).
    const numero = await getNextFactureNumero(user.companyId);

    // Flip BROUILLON→EMISE conditionnel : garde-fou double-clic. Seule la
    // 1ère requête (statut encore BROUILLON) gagne. La contrainte unique
    // (companyId, numero) est le backstop ultime contre tout doublon.
    const flip = await prisma.facture.updateMany({
      where: { id, companyId: user.companyId, statut: "BROUILLON" },
      data: {
        statut: "EMISE",
        numero,
        dateEmission: now,
        dateEcheance,
        emiseAt: now, // Marque l'immuabilité
      },
    });

    if (flip.count === 0) {
      // Une autre requête a émis entre-temps. Le numéro tiré ci-dessus n'est
      // pas réutilisé (trou toléré) — aucune double émission.
      return Response.json(
        { error: "Cette facture a déjà été émise" },
        { status: 409 }
      );
    }

    const updated = await prisma.facture.findFirstOrThrow({ where: { id } });

    // Envoyer par email si PDF disponible. L'émission (immuabilité légale) est
    // déjà committée ci-dessus : un échec/skip d'envoi ne doit JAMAIS la
    // remettre en cause. sendFactureEmail passe par sendEmailSafe → si
    // MAIL_KILL_SWITCH est actif, aucun mail ne part (skipped, pas d'erreur).
    if (facture.pdfUrl && facture.client.email) {
      try {
        await sendFactureEmail({
          to: facture.client.email,
          clientName: facture.client.name,
          companyName: facture.nomEmetteur,
          factureNumero: numero,
          totalTtc: facture.totalTtc,
          dateEcheance,
          pdfUrl: facture.pdfUrl,
          iban: facture.ibanEmetteur,
          bic: facture.bicEmetteur,
        });
      } catch (mailErr) {
        console.error(
          `[emettre facture ${id}] envoi mail échoué (facture émise quand même) :`,
          mailErr
        );
      }
    }

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_EMISE",
      entityType: "Facture",
      entityId: id,
      details: {
        numero,
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
