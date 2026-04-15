import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateFactureSchema = z.object({
  numeroBdc: z.string().optional().nullable(),
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
    if (existing.emiseAt) return Response.json({ error: "Facture immuable après émission" }, { status: 403 });

    const body = await req.json();
    const input = UpdateFactureSchema.parse(body);

    const facture = await prisma.facture.update({
      where: { id },
      data: {
        ...(input.numeroBdc !== undefined && { numeroBdc: input.numeroBdc }),
      },
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
