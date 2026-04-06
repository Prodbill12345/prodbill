export const runtime = "nodejs";

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FacturePdf } from "@/components/factures/FacturePdf";
import { sendRelanceEmail } from "@/lib/email/resend";
import type { RelanceType } from "@prisma/client";
import React from "react";

/**
 * POST /api/factures/[id]/relancer
 * Détermine automatiquement le niveau de relance selon l'historique
 * puis envoie l'email approprié avec le PDF joint.
 *
 * Niveaux :
 *   0 relances précédentes → RELANCE_1
 *   1 relance              → RELANCE_2
 *   2+ relances            → MISE_EN_DEMEURE
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:send");
    const { id } = await params;

    const [facture, company] = await Promise.all([
      prisma.facture.findFirst({
        where: { id, companyId: user.companyId },
        include: {
          client: true,
          devis: { select: { numero: true, objet: true } },
          relances: { orderBy: { sentAt: "asc" } },
        },
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { logoUrl: true, primaryColor: true, iban: true, bic: true },
      }),
    ]);

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (!facture.emiseAt) {
      return Response.json(
        { error: "La facture doit être émise avant d'être relancée" },
        { status: 400 }
      );
    }

    if (facture.statut === "PAYEE" || facture.statut === "ANNULEE") {
      return Response.json(
        { error: "Impossible de relancer une facture soldée ou annulée" },
        { status: 400 }
      );
    }

    // Déterminer le niveau de relance selon les relances déjà envoyées (hors ENVOI)
    const relancesHorsEnvoi = facture.relances.filter((r) => r.type !== "ENVOI");
    const type: RelanceType =
      relancesHorsEnvoi.length === 0 ? "RELANCE_1"
      : relancesHorsEnvoi.length === 1 ? "RELANCE_2"
      : "MISE_EN_DEMEURE";

    // Calcul jours de retard et pénalités
    const now = new Date();
    const joursRetard = facture.dateEcheance
      ? Math.max(0, Math.floor((now.getTime() - new Date(facture.dateEcheance).getTime()) / 86400000))
      : 0;
    const penalites = joursRetard > 0
      ? Math.round(facture.totalTtc * 0.15 * (joursRetard / 365) * 100) / 100
      : 0;

    // Date de la 1ère relance (pour template RELANCE_2)
    const premiereRelance = relancesHorsEnvoi[0];

    // Générer le PDF
    const devisNormalized = facture.devis
      ? { ...facture.devis, numero: facture.devis.numero ?? "" }
      : null;
    const factureForPdf = { ...facture, devis: devisNormalized, logoUrl: company?.logoUrl ?? null };
    const pdfBuffer = Buffer.from(
      await renderToBuffer(React.createElement(FacturePdf, { facture: factureForPdf }) as never)
    );

    const subject = await sendRelanceEmail(type, {
      to: facture.client.email,
      clientName: facture.client.name,
      companyName: facture.nomEmetteur,
      factureNumero: facture.numero,
      totalTtc: facture.totalTtc,
      dateEcheance: facture.dateEcheance ?? new Date(),
      joursRetard,
      penalites,
      iban: company?.iban || facture.ibanEmetteur,
      bic: company?.bic || facture.bicEmetteur,
      pdfBuffer,
      accentColor: company?.primaryColor ?? "#3b82f6",
      premierRelanceDate: premiereRelance ? new Date(premiereRelance.sentAt) : undefined,
    });

    await prisma.relance.create({
      data: {
        factureId: id,
        companyId: user.companyId,
        type,
        sentTo: facture.client.email,
        subject,
        createdById: user.id,
      },
    });

    return Response.json({ success: true, type, sentTo: facture.client.email });
  } catch (err) {
    return handleAuthError(err);
  }
}
