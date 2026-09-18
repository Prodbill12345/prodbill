import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDeleteFacture } from "@/lib/facture-delete";
import { del } from "@vercel/blob";
import { z } from "zod";

const UpdateFactureSchema = z.object({
  numeroBdc: z.string().optional().nullable(),
  dateReglement: z.string().nullable().optional(), // "YYYY-MM-DD"
  // #98 : le numéro est attribué à l'émission et immuable — plus d'édition
  // manuelle (le champ `numero` n'est plus accepté ici).
  dateEmission: z.string().nullable().optional(), // "YYYY-MM-DD" (correction import)
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:create");
    const { id } = await params;

    const existing = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return Response.json({ error: "Facture introuvable" }, { status: 404 });

    const body = await req.json();
    const input = UpdateFactureSchema.parse(body);

    // numeroBdc : normalement verrouillé après émission, mais on autorise la correction
    // de données importées (emiseAt peut être null pour les imports CSV)

    // Détection d'une modif de dateEmission post-émission pour AuditLog.
    // Comparaison sur les valeurs ISO YYYY-MM-DD (`toInputValue` UI) pour
    // ne pas se faire piéger par l'heure interne ou le TZ.
    const newDateEmissionIso = input.dateEmission ?? null;
    const existingDateEmissionIso = existing.dateEmission
      ? existing.dateEmission.toISOString().slice(0, 10)
      : null;
    const dateEmissionChanged =
      input.dateEmission !== undefined &&
      newDateEmissionIso !== existingDateEmissionIso;
    const isPostEmission = existing.statut !== "BROUILLON";

    const facture = await prisma.$transaction(async (tx) => {
      const updated = await tx.facture.update({
        where: { id },
        data: {
          ...(input.numeroBdc !== undefined && { numeroBdc: input.numeroBdc }),
          ...(input.dateReglement !== undefined && {
            dateReglement: input.dateReglement ? new Date(input.dateReglement) : null,
          }),
          ...(input.dateEmission !== undefined && {
            dateEmission: input.dateEmission ? new Date(input.dateEmission) : null,
          }),
        },
      });

      if (dateEmissionChanged && isPostEmission) {
        await tx.auditLog.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            userName: user.email,
            action: "FACTURE_DATE_EMISSION_MODIFIED",
            entityType: "Facture",
            entityId: id,
            factureId: id,
            details: {
              statut: existing.statut,
              before: existingDateEmissionIso,
              after: newDateEmissionIso,
              warning: "Modification post-émission — art. 289 CGI (immutabilité)",
            },
          },
        });
      }

      return updated;
    });

    return Response.json({ data: facture });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:read");
    const { id } = await params;

    const facture = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        client: true,
        devis: {
          include: {
            sections: {
              include: { lignes: { orderBy: { ordre: "asc" } } },
              orderBy: { ordre: "asc" },
            },
          },
        },
        paiements: { orderBy: { date: "desc" } },
      },
    });

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    return Response.json({ data: facture });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Suppression d'une facture — BROUILLON uniquement
 * (FEAT-FACTURE-BROUILLON-DELETE).
 *
 * Une facture émise est immuable (art. 289 CGI) : elle s'annule par un AVOIR,
 * jamais par une suppression. La décision est déléguée au helper pur
 * canDeleteFacture() (cf. src/lib/facture-delete.ts), partagé avec l'UI.
 *
 * Effets de bord assumés :
 *   - FactureDevis : ON DELETE CASCADE (migration 20260907120000) → les liens
 *     disparaissent et les devis sources redeviennent immédiatement éligibles
 *     à une nouvelle facturation (l'éligibilité est calculée en live depuis
 *     cette table, cf. /api/factures/recap et devis-recap-visibility).
 *   - Relance : ON DELETE CASCADE. En pratique vide sur un brouillon
 *     (une relance suppose une facture émise).
 *   - AuditLog : ON DELETE SET NULL → la trace d'audit survit à la
 *     suppression, mais perd son `factureId`. On journalise donc la
 *     suppression SANS `factureId` (il serait aussitôt nullifié) : l'id de la
 *     pièce vit dans `entityId` + le détail snapshot ci-dessous.
 *   - Paiement : ON DELETE RESTRICT → refusé en amont par le helper.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:delete");
    const { id } = await params;

    const existing = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
      select: {
        id: true,
        statut: true,
        numero: true,
        emiseAt: true,
        type: true,
        clientId: true,
        totalHt: true,
        totalTtc: true,
        pdfUrl: true,
        facturxUrl: true,
        _count: { select: { paiements: true, devisLinks: true } },
      },
    });

    if (!existing) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    const decision = canDeleteFacture({
      statut: existing.statut,
      numero: existing.numero,
      emiseAt: existing.emiseAt,
      paiementsCount: existing._count.paiements,
    });

    if (!decision.ok) {
      return Response.json({ error: decision.message }, { status: 400 });
    }

    // Devis sources, capturés AVANT la suppression : ils redeviennent
    // facturables une fois les liens FactureDevis cascadés.
    const links = await prisma.factureDevis.findMany({
      where: { factureId: id },
      select: { devisId: true },
    });
    const devisIds = links.map((l) => l.devisId);

    // Cleanup blobs — tolérant, comme pour le devis : un blob déjà absent
    // côté Vercel ne doit pas bloquer la suppression. En pratique un
    // brouillon n'a rien (pdfUrl/facturxUrl ne sont écrits nulle part
    // aujourd'hui), mais les imports historiques peuvent en porter.
    for (const url of [existing.pdfUrl, existing.facturxUrl]) {
      if (!url) continue;
      try {
        await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (err) {
        console.warn(
          `[DELETE facture ${id}] del() blob échoué, on continue: ${String(err)}`
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.facture.delete({ where: { id } });

      // `factureId` volontairement omis : le FK est SET NULL, il serait
      // effacé par la suppression ci-dessus.
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          userName: user.email,
          action: "FACTURE_BROUILLON_SUPPRIMEE",
          entityType: "Facture",
          entityId: id,
          details: {
            type: existing.type,
            statut: existing.statut,
            clientId: existing.clientId,
            totalHt: existing.totalHt,
            totalTtc: existing.totalTtc,
            devisIds,
            devisLinksSupprimes: existing._count.devisLinks,
          },
        },
      });
    });

    return Response.json({ success: true, devisIds });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = 'force-dynamic';
