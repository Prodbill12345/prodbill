import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PipeSchema = z.object({
  tauxPipe: z.number().int().min(0).max(100).nullable(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    const existing = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const { tauxPipe } = PipeSchema.parse(body);

    const devis = await prisma.devis.update({
      where: { id },
      data: { tauxPipe },
      select: { id: true, tauxPipe: true },
    });

    return Response.json({ data: devis });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
