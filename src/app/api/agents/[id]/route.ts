import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const AgentSchema = z.object({
  nom: z.string().min(1).optional(),
  prenom: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telephone: z.string().optional(),
  agence: z.string().optional(),
  tauxCommission: z.number().min(0).max(100).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    const existing = await prisma.agent.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return Response.json({ error: "Agent introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const input = AgentSchema.parse(body);

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(input.nom !== undefined && { nom: input.nom }),
        ...(input.prenom !== undefined && { prenom: input.prenom || null }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.telephone !== undefined && { telephone: input.telephone || null }),
        ...(input.agence !== undefined && { agence: input.agence || null }),
        ...(input.tauxCommission !== undefined && { tauxCommission: input.tauxCommission }),
      },
    });
    return Response.json({ data: agent });
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
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    const existing = await prisma.agent.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return Response.json({ error: "Agent introuvable" }, { status: 404 });
    }

    // Détacher les lignes liées avant suppression
    await prisma.devisLigne.updateMany({
      where: { agentId: id },
      data: { agentId: null },
    });

    await prisma.agent.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
