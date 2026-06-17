/**
 * POST /api/factures/[id]/payee
 *
 * Bouton "Marquer payée" (ticket #92). Bascule une facture en PAYEE
 * en un clic, sans formulaire detaille. Cree un Paiement auto de la
 * somme restante avec mode magique MARQUEE_MANUELLE — distinguable
 * d'un vrai paiement saisi via /api/paiements.
 *
 * Garde-fous :
 *   - statut doit etre EMISE / EN_RETARD / PAYEE_PARTIEL (= "facture
 *     en attente de paiement"). On utilise le statut comme source de
 *     verite, PAS emiseAt : certaines factures historiques de NONNA
 *     ont statut=EMISE avec emiseAt=null (imports pre-champ-emiseAt).
 *   - statut != ANNULEE / BROUILLON / AVOIR
 *   - statut != PAYEE (idempotence : on retourne 200 silencieusement)
 */

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { computeMarquerPayeePlan } from "@/lib/facture-payee";

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
    // Statut comme source de vérité — voir docstring tête de fichier
    // pour la justification (factures NONNA avec emiseAt=null).
    if (facture.statut === "BROUILLON") {
      return Response.json(
        { error: "La facture doit être émise avant de pouvoir être marquée payée." },
        { status: 400 }
      );
    }
    if (facture.statut === "ANNULEE") {
      return Response.json(
        { error: "Facture annulée." },
        { status: 400 }
      );
    }
    if (facture.type === "AVOIR") {
      return Response.json(
        { error: "Un avoir ne peut pas être marqué payé." },
        { status: 400 }
      );
    }
    if (facture.statut === "PAYEE") {
      // Idempotence : deja paye, on ne fait rien (pas d'erreur).
      return Response.json({ data: { alreadyPaid: true } });
    }

    const plan = computeMarquerPayeePlan(facture.totalTtc, facture.paiements);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (plan.shouldCreatePaiement) {
        await tx.paiement.create({
          data: {
            companyId: user.companyId,
            factureId: facture.id,
            montant: plan.autoMontant,
            date: now,
            mode: plan.autoMode,
            notes: "Marqué payé manuellement",
          },
        });
      }

      await tx.facture.update({
        where: { id: facture.id },
        data: {
          statut: "PAYEE",
          datePaiement: now,
        },
      });
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_MARQUEE_PAYEE",
      entityType: "Facture",
      entityId: facture.id,
      details: {
        numero: facture.numero,
        autoPaiementMontant: plan.shouldCreatePaiement ? plan.autoMontant : 0,
      },
      factureId: facture.id,
    });

    return Response.json({
      data: { statut: "PAYEE", datePaiement: now.toISOString() },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
