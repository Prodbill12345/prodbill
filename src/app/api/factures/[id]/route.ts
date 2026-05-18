import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateFactureSchema = z.object({
  numeroBdc: z.string().optional().nullable(),
  dateReglement: z.string().nullable().optional(), // "YYYY-MM-DD"
  // Champs de correction (données importées)
  numero: z.string().min(1).optional(),
  dateEmission: z.string().nullable().optional(), // "YYYY-MM-DD"
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
          ...(input.numero !== undefined && { numero: input.numero }),
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
export const dynamic = 'force-dynamic';
