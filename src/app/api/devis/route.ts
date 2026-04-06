import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculerDevis } from "@/lib/calculations";
import { z } from "zod";

const LigneSchema = z.object({
  libelle: z.string().min(1),
  tag: z.enum(["COMEDIEN", "TECHNICIEN_HCS", "DROIT", "FORFAIT", "MATERIEL", "AGENT"]),
  quantite: z.number().positive(),
  prixUnit: z.number().min(0),
  ordre: z.number().int(),
});

const SectionSchema = z.object({
  titre: z.string().min(1),
  ordre: z.number().int(),
  lignes: z.array(LigneSchema),
});

const CreateDevisSchema = z.object({
  // .cuid() ne valide que CUID1 — Prisma 7 génère du CUID2 (format différent)
  clientId: z.string().min(1),
  objet: z.string().min(1),
  tauxCsComedien: z.number().min(0).max(1).default(0.57),
  tauxCsTech: z.number().min(0).max(1).default(0.65),
  tauxFg: z.number().min(0).max(1).default(0.05),
  tauxMarge: z.number().min(0).max(1).default(0.15),
  // <input type="date"> envoie "YYYY-MM-DD", pas un ISO datetime complet
  dateValidite: z.string().optional(),
  notes: z.string().optional(),
  sections: z.array(SectionSchema),
});

export async function GET() {
  try {
    const user = await requireAuth("devis:read");

    const devis = await prisma.devis.findMany({
      where: { companyId: user.companyId },
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { sections: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({ data: devis });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("devis:create");
    const body = await req.json();
    const input = CreateDevisSchema.parse(body);

    // Vérifier que le client appartient à cette société
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, companyId: user.companyId },
    });
    if (!client) {
      return Response.json({ error: "Client introuvable" }, { status: 404 });
    }

    // Calculer les totaux
    const allLignes = input.sections.flatMap((s) => s.lignes);
    const taux = {
      tauxCsComedien: input.tauxCsComedien,
      tauxCsTech: input.tauxCsTech,
      tauxFg: input.tauxFg,
      tauxMarge: input.tauxMarge,
    };
    const totaux = calculerDevis(allLignes, taux);

    const devis = await prisma.devis.create({
      data: {
        companyId: user.companyId,
        clientId: input.clientId,
        objet: input.objet,
        ...taux,
        ...totaux,
        dateValidite: input.dateValidite ? new Date(input.dateValidite) : null,
        notes: input.notes,
        createdById: user.id,
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
                ordre: ligne.ordre,
              })),
            },
          })),
        },
      },
      include: {
        client: true,
        sections: { include: { lignes: true }, orderBy: { ordre: "asc" } },
      },
    });

    return Response.json({ data: devis }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error("[POST /api/devis] ZodError:", JSON.stringify(err.issues, null, 2));
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}
