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
          devis: {
            select: {
              numero: true,
              objet: true,
              totalHt: true,
              sections: {
                orderBy: { ordre: "asc" },
                select: {
                  id: true,
                  titre: true,
                  ordre: true,
                  lignes: {
                    orderBy: { ordre: "asc" },
                    select: {
                      id: true,
                      libelle: true,
                      tag: true,
                      quantite: true,
                      prixUnit: true,
                      total: true,
                      tauxIndexation: true,
                    },
                  },
                },
              },
            },
          },
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

    // Le client peut ne pas avoir d'email (optionnel) — la relance est alors impossible.
    const clientEmail = facture.client.email;
    if (!clientEmail) {
      return Response.json(
        { error: "Ce client n'a pas d'email renseigné — impossible de relancer" },
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

    const { subject, skipped } = await sendRelanceEmail(type, {
      to: clientEmail,
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

    // Kill switch actif : aucun mail parti → on n'enregistre PAS de Relance
    // (elle logguerait un envoi qui n'a pas eu lieu).
    if (skipped) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "MAIL_KILL_SWITCH",
        type,
      });
    }

    await prisma.relance.create({
      data: {
        factureId: id,
        companyId: user.companyId,
        type,
        sentTo: clientEmail,
        subject,
        createdById: user.id,
      },
    });

    return Response.json({ success: true, type, sentTo: clientEmail });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
