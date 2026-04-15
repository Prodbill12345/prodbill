import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const AgentSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telephone: z.string().optional(),
  agence: z.string().optional(),
  tauxCommission: z.number().min(0).max(100).default(10),
});

export async function GET() {
  try {
    const user = await requireAuth("devis:read");
    const agents = await prisma.agent.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ agence: "asc" }, { nom: "asc" }],
    });
    return Response.json({ data: agents });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("devis:edit");
    const body = await req.json();
    const input = AgentSchema.parse(body);

    const agent = await prisma.agent.create({
      data: {
        companyId: user.companyId,
        nom: input.nom,
        prenom: input.prenom ?? null,
        email: input.email || null,
        telephone: input.telephone ?? null,
        agence: input.agence ?? null,
        tauxCommission: input.tauxCommission,
      },
    });
    return Response.json({ data: agent }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
