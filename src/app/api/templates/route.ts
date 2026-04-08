import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const LigneTemplateSchema = z.object({
  libelle: z.string().min(1),
  tag: z.enum(["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"]),
  quantite: z.number(),
  prixUnit: z.number().min(0),
  ordre: z.number().int(),
});

const SectionTemplateSchema = z.object({
  titre: z.string(),
  lignes: z.array(LigneTemplateSchema),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  description: z.string().optional(),
  isShared: z.boolean().default(false),
  tauxCsComedien: z.number().min(0).max(1),
  tauxCsTech: z.number().min(0).max(1),
  tauxFg: z.number().min(0).max(1),
  tauxMarge: z.number().min(0).max(1),
  sections: z.array(SectionTemplateSchema),
});

export async function GET() {
  try {
    const user = await requireAuth("devis:read");

    const templates = await prisma.devisTemplate.findMany({
      where: {
        companyId: user.companyId,
        OR: [{ userId: user.id }, { isShared: true }],
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ isShared: "desc" }, { createdAt: "desc" }],
    });

    return Response.json({ data: templates });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("devis:create");
    const body = await req.json();
    const input = CreateTemplateSchema.parse(body);

    const template = await prisma.devisTemplate.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        name: input.name,
        description: input.description,
        isShared: input.isShared,
        tauxCsComedien: input.tauxCsComedien,
        tauxCsTech: input.tauxCsTech,
        tauxFg: input.tauxFg,
        tauxMarge: input.tauxMarge,
        sections: input.sections,
      },
    });

    return Response.json({ data: template }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
