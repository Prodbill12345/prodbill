/**
 * POST /api/factures/[id]/unpay
 *
 * Bouton "Annuler le paiement" (ticket #92). Annule l'effet d'un clic
 * "Marquer payée" passe par erreur : remet la facture en EMISE et
 * supprime les Paiements MARQUEE_MANUELLE crees automatiquement.
 *
 * Garde-fous :
 *   - facture statut doit etre PAYEE
 *   - aucun Paiement non-MARQUEE_MANUELLE (= vrai paiement saisi via le
 *     module detaille) — sinon refus avec message explicite. C'est une
 *     protection : on ne veut PAS effacer une saisie reelle de Vanda.
 */

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canUnpayFacture } from "@/lib/facture-payee";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("paiement:create");
    const { id } = await params;

    const facture = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
      include: { paiements: true },
    });

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }
    if (facture.statut !== "PAYEE") {
      return Response.json(
        { error: "Seule une facture marquée payée peut être déannulée." },
        { status: 400 }
      );
    }

    const check = canUnpayFacture(facture.paiements);
    if (!check.ok) {
      return Response.json({ error: check.message }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      if (check.autoPaiementsIds.length > 0) {
        await tx.paiement.deleteMany({
          where: { id: { in: check.autoPaiementsIds } },
        });
      }
      await tx.facture.update({
        where: { id: facture.id },
        data: {
          statut: "EMISE",
          datePaiement: null,
        },
      });
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_PAIEMENT_ANNULE",
      entityType: "Facture",
      entityId: facture.id,
      details: {
        numero: facture.numero,
        autoPaiementsSupprimes: check.autoPaiementsIds.length,
      },
      factureId: facture.id,
    });

    return Response.json({
      data: { statut: "EMISE", datePaiement: null },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
