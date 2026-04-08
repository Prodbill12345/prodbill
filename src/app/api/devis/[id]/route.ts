import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculerDevis } from "@/lib/calculations";
import { z } from "zod";

const LigneSchema = z.object({
  id: z.string().optional(),
  libelle: z.string().min(1),
  tag: z.enum(["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"]),
  quantite: z.number().positive(),
  prixUnit: z.number().min(0),
  tauxIndexation: z.number().min(0).max(100).default(0),
  ordre: z.number().int(),
});

const SectionSchema = z.object({
  id: z.string().optional(),
  titre: z.string().min(1),
  ordre: z.number().int(),
  lignes: z.array(LigneSchema),
});

const UpdateDevisSchema = z.object({
  objet: z.string().min(1).optional(),
  description: z.string().optional(),
  tauxCsComedien: z.number().min(0).max(1).optional(),
  tauxCsTech: z.number().min(0).max(1).optional(),
  tauxFg: z.number().min(0).max(1).optional(),
  tauxMarge: z.number().min(0).max(1).optional(),
  // <input type="date"> envoie "YYYY-MM-DD", pas un ISO datetime complet
  dateValidite: z.string().nullable().optional(),
  notes: z.string().optional(),
  remise: z.number().min(0).optional(),
  sections: z.array(SectionSchema).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:read");
    const { id } = await params;

    const devis = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        client: true,
        sections: {
          include: { lignes: { orderBy: { ordre: "asc" } } },
          orderBy: { ordre: "asc" },
        },
        bdc: true,
        factures: { include: { paiements: true } },
      },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    return Response.json({ data: devis });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    // Vérifier que le devis appartient à cette société et est éditable
    const existing = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!existing) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (existing.statut === "ACCEPTE" || existing.statut === "REFUSE") {
      return Response.json(
        { error: "Ce devis ne peut plus être modifié" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const input = UpdateDevisSchema.parse(body);

    // Recalculer si les sections sont mises à jour
    let totaux = {};
    if (input.sections) {
      const allLignes = input.sections.flatMap((s) => s.lignes);
      const taux = {
        tauxCsComedien: input.tauxCsComedien ?? existing.tauxCsComedien,
        tauxCsTech: input.tauxCsTech ?? existing.tauxCsTech,
        tauxFg: input.tauxFg ?? existing.tauxFg,
        tauxMarge: input.tauxMarge ?? existing.tauxMarge,
      };
      const remise = input.remise ?? existing.remise;
      totaux = calculerDevis(allLignes, taux, remise);
    }

    // Mettre à jour le devis avec remplacement des sections
    const devis = await prisma.$transaction(async (tx) => {
      if (input.sections) {
        // Supprimer les anciennes sections (cascade supprime les lignes)
        await tx.devisSection.deleteMany({ where: { devisId: id } });
      }

      return tx.devis.update({
        where: { id },
        data: {
          ...(input.objet && { objet: input.objet }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.tauxCsComedien !== undefined && { tauxCsComedien: input.tauxCsComedien }),
          ...(input.tauxCsTech !== undefined && { tauxCsTech: input.tauxCsTech }),
          ...(input.tauxFg !== undefined && { tauxFg: input.tauxFg }),
          ...(input.tauxMarge !== undefined && { tauxMarge: input.tauxMarge }),
          ...(input.dateValidite !== undefined && {
            dateValidite: input.dateValidite ? new Date(input.dateValidite) : null,
          }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.remise !== undefined && { remise: input.remise }),
          ...totaux,
          ...(input.sections && {
            sections: {
              create: input.sections.map((section) => ({
                titre: section.titre,
                ordre: section.ordre,
                lignes: {
                  create: section.lignes.map((ligne) => ({
                    libelle: ligne.libelle,
                    tag: ligne.tag,
                    quantite: ligne.quantite,
                    prixUnit: ligne.prixUnit,
                    total: ligne.quantite * ligne.prixUnit,
                    tauxIndexation: ligne.tauxIndexation ?? 0,
                    ordre: ligne.ordre,
                  })),
                },
              })),
            },
          }),
        },
        include: {
          client: true,
          sections: {
            include: { lignes: { orderBy: { ordre: "asc" } } },
            orderBy: { ordre: "asc" },
          },
        },
      });
    });

    return Response.json({ data: devis });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:delete");
    const { id } = await params;

    const existing = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!existing) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (existing.statut !== "BROUILLON") {
      return Response.json(
        { error: "Seuls les brouillons peuvent être supprimés" },
        { status: 403 }
      );
    }

    await prisma.devis.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
