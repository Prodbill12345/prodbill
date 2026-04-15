import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ComedienSchema = z.object({
  prenom: z.string().min(1).optional(),
  nom: z.string().min(1).optional(),
  agentId: z.string().optional().nullable(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;
    const existing = await prisma.comedien.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return Response.json({ error: "Comédien introuvable" }, { status: 404 });
    const body = await req.json();
    const input = ComedienSchema.parse(body);
    const comedien = await prisma.comedien.update({
      where: { id },
      data: {
        ...(input.prenom && { prenom: input.prenom }),
        ...(input.nom && { nom: input.nom }),
        ...(input.agentId !== undefined && { agentId: input.agentId }),
      },
      include: { agent: { select: { id: true, nom: true, prenom: true, agence: true } } },
    });
    return Response.json({ data: comedien });
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
    const existing = await prisma.comedien.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return Response.json({ error: "Comédien introuvable" }, { status: 404 });
    // Détacher les lignes avant suppression
    await prisma.devisLigne.updateMany({ where: { comedienId: id }, data: { comedienId: null } });
    await prisma.comedien.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
