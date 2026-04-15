import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ComedienSchema = z.object({
  prenom: z.string().min(1),
  nom: z.string().min(1),
  agentId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireAuth("devis:read");
    const comediens = await prisma.comedien.findMany({
      where: { companyId: user.companyId },
      include: { agent: { select: { id: true, nom: true, prenom: true, agence: true } } },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    });
    return Response.json({ data: comediens });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("devis:create");
    const body = await req.json();
    const input = ComedienSchema.parse(body);
    const comedien = await prisma.comedien.create({
      data: {
        companyId: user.companyId,
        prenom: input.prenom,
        nom: input.nom,
        agentId: input.agentId ?? null,
      },
      include: { agent: { select: { id: true, nom: true, prenom: true, agence: true } } },
    });
    return Response.json({ data: comedien }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
