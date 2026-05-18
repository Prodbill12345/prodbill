import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculerDevis } from "@/lib/calculations";
import { optionalFkId } from "@/lib/zod-helpers";
import { z } from "zod";

const LigneSchema = z.object({
  id: z.string().optional(),
  libelle: z.string().min(1),
  tag: z.enum(["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"]),
  quantite: z.number().positive(),
  prixUnit: z.number().min(0),
  tauxIndexation: z.number().min(0).max(100).default(0),
  comedienId: optionalFkId,
  agentId: optionalFkId,
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
  nomProjet: z.string().optional(),
  refDevis: z.string().optional(),
  annee: z.number().int().min(2000).max(2100).nullable().optional(),
  tauxCsComedien: z.number().min(0).max(1).optional(),
  tauxCsTech: z.number().min(0).max(1).optional(),
  tauxFg: z.number().min(0).max(1).optional(),
  tauxMarge: z.number().min(0).max(1).optional(),
  // TVA personnalisable (FIX 2). Pourcentage entier 0..100.
  tauxTva: z.number().min(0).max(100).optional(),
  // Mention légale TVA (utile uniquement si tauxTva=0)
  tvaMention: z.string().nullable().optional(),
  // <input type="date"> envoie "YYYY-MM-DD", pas un ISO datetime complet
  dateEmission: z.string().nullable().optional(),
  dateValidite: z.string().nullable().optional(),
  dateSeance: z.string().nullable().optional(),
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
      const tauxTva = input.tauxTva ?? existing.tauxTva;
      const { indexationsArtiste: _ia, indexationsMusique: _im, ...totauxPrisma } = calculerDevis(
        allLignes,
        taux,
        remise,
        tauxTva
      );
      totaux = totauxPrisma;
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
          ...(input.nomProjet !== undefined && { nomProjet: input.nomProjet }),
          ...(input.refDevis !== undefined && { refDevis: input.refDevis }),
          ...(input.annee !== undefined && { annee: input.annee }),
          ...(input.tauxCsComedien !== undefined && { tauxCsComedien: input.tauxCsComedien }),
          ...(input.tauxCsTech !== undefined && { tauxCsTech: input.tauxCsTech }),
          ...(input.tauxFg !== undefined && { tauxFg: input.tauxFg }),
          ...(input.tauxMarge !== undefined && { tauxMarge: input.tauxMarge }),
          ...(input.tauxTva !== undefined && { tauxTva: input.tauxTva }),
          // tvaMention : forcé à null si TVA != 0 (cleanup automatique
          // quand l'utilisateur quitte le mode "TVA non applicable")
          ...(input.tauxTva !== undefined && {
            tvaMention: input.tauxTva === 0 ? input.tvaMention ?? null : null,
          }),
          ...(input.dateEmission !== undefined && {
            dateEmission: input.dateEmission ? new Date(input.dateEmission) : null,
          }),
          ...(input.dateValidite !== undefined && {
            dateValidite: input.dateValidite ? new Date(input.dateValidite) : null,
          }),
          ...(input.dateSeance !== undefined && {
            dateSeance: input.dateSeance ? new Date(input.dateSeance) : null,
          }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.remise !== undefined && { remise: input.remise }),
          ...totaux,
          ...(input.sections && {
            sections: {
              // Phase 1 multi-tenant : companyId injecté sur les nested
              create: input.sections.map((section) => ({
                companyId: user.companyId,
                titre: section.titre,
                ordre: section.ordre,
                lignes: {
                  create: section.lignes.map((ligne) => ({
                    companyId: user.companyId,
                    libelle: ligne.libelle,
                    tag: ligne.tag,
                    quantite: ligne.quantite,
                    prixUnit: ligne.prixUnit,
                    total: ligne.quantite * ligne.prixUnit,
                    tauxIndexation: ligne.tauxIndexation ?? 0,
                    comedienId: ligne.comedienId ?? null,
                    agentId: ligne.agentId ?? null,
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
