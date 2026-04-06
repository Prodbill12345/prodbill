export const runtime = "nodejs";

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FacturePdf } from "@/components/factures/FacturePdf";
import { sendRelanceEmail } from "@/lib/email/resend";
import React from "react";

/**
 * POST /api/factures/[id]/envoyer
 * Envoie la facture par email avec le PDF en pièce jointe.
 * Crée un enregistrement Relance de type ENVOI.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:send"); // même permission que l'envoi de devis
    const { id } = await params;

    const [facture, company] = await Promise.all([
      prisma.facture.findFirst({
        where: { id, companyId: user.companyId },
        include: {
          client: true,
          devis: { select: { numero: true, objet: true } },
        },
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { logoUrl: true, primaryColor: true, iban: true, bic: true, name: true },
      }),
    ]);

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (!facture.emiseAt) {
      return Response.json(
        { error: "La facture doit être émise avant d'être envoyée" },
        { status: 400 }
      );
    }

    // Générer le PDF
    const devisNormalized = facture.devis
      ? { ...facture.devis, numero: facture.devis.numero ?? "" }
      : null;
    const factureForPdf = { ...facture, devis: devisNormalized, logoUrl: company?.logoUrl ?? null };
    const pdfBuffer = Buffer.from(
      await renderToBuffer(React.createElement(FacturePdf, { facture: factureForPdf }) as never)
    );

    // Calcul pénalités si retard
    const now = new Date();
    const joursRetard = facture.dateEcheance
      ? Math.max(0, Math.floor((now.getTime() - new Date(facture.dateEcheance).getTime()) / 86400000))
      : 0;
    const penalites = joursRetard > 0
      ? Math.round(facture.totalTtc * 0.15 * (joursRetard / 365) * 100) / 100
      : 0;

    const subject = await sendRelanceEmail("ENVOI", {
      to: facture.client.email,
      clientName: facture.client.name,
      companyName: facture.nomEmetteur,
      factureNumero: facture.numero,
      totalTtc: facture.totalTtc,
      dateEcheance: facture.dateEcheance ?? new Date(),
      joursRetard,
      penalites,
      // IBAN/BIC lus en temps réel depuis Company — le snapshot facture peut être vide
      // si les coordonnées bancaires ont été ajoutées après la création de la facture.
      iban: company?.iban || facture.ibanEmetteur,
      bic: company?.bic || facture.bicEmetteur,
      pdfBuffer,
      accentColor: company?.primaryColor ?? "#3b82f6",
    });

    await prisma.relance.create({
      data: {
        factureId: id,
        companyId: user.companyId,
        type: "ENVOI",
        sentTo: facture.client.email,
        subject,
        createdById: user.id,
      },
    });

    return Response.json({ success: true, sentTo: facture.client.email });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
