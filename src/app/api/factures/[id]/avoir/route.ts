import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextFactureNumero } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/factures/[id]/avoir
 * Génère un avoir (crédit note) depuis une facture émise.
 * L'avoir reprend les montants inversés (négatifs).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:create");
    const { id } = await params;

    const facture = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (facture.statut !== "EMISE" && facture.statut !== "PAYEE" && facture.statut !== "PAYEE_PARTIEL") {
      return Response.json(
        { error: "Un avoir ne peut être généré que depuis une facture émise" },
        { status: 400 }
      );
    }

    if (facture.type === "AVOIR") {
      return Response.json(
        { error: "Impossible de générer un avoir depuis un avoir" },
        { status: 400 }
      );
    }

    // Vérifier qu'un avoir n'existe pas déjà pour cette facture
    // (on utilise le numero préfixé AV-)
    const avoirNumero = `AV-${facture.numero}`;
    const existingAvoir = await prisma.facture.findFirst({
      where: { companyId: user.companyId, numero: avoirNumero },
    });
    if (existingAvoir) {
      return Response.json(
        { error: "Un avoir existe déjà pour cette facture" },
        { status: 409 }
      );
    }

    // L'avoir reprend les montants en négatif
    const totalHt = -Math.abs(facture.totalHt);
    const tva = -Math.abs(facture.tva);
    const totalTtc = -Math.abs(facture.totalTtc);

    const numero = await getNextFactureNumero(
      user.companyId,
      "AVOIR",
      facture.numero
    );

    const avoir = await prisma.facture.create({
      data: {
        companyId: user.companyId,
        clientId: facture.clientId,
        devisId: facture.devisId,
        numero,
        type: "AVOIR",
        statut: "EMISE",
        totalHt,
        tva,
        totalTtc,
        dateEmission: new Date(),
        // Snapshot des mentions légales
        siretEmetteur: facture.siretEmetteur,
        tvaIntraEmetteur: facture.tvaIntraEmetteur,
        ibanEmetteur: facture.ibanEmetteur,
        bicEmetteur: facture.bicEmetteur,
        conditionsPaiement: facture.conditionsPaiement,
        nomEmetteur: facture.nomEmetteur,
        adresseEmetteur: facture.adresseEmetteur,
        emiseAt: new Date(),
        createdById: user.id,
      },
      include: { client: true, devis: true },
    });

    // Annuler la facture source si elle n'est pas déjà payée
    if (facture.statut === "EMISE") {
      await prisma.facture.update({
        where: { id },
        data: { statut: "ANNULEE" },
      });
    }

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "AVOIR_CREE",
      entityType: "Facture",
      entityId: avoir.id,
      details: {
        numero: avoir.numero,
        factureSourceId: id,
        factureSourceNumero: facture.numero,
        totalHt: avoir.totalHt,
      },
      factureId: avoir.id,
    });

    return Response.json({ data: avoir }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}
