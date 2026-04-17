import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PaiementSchema = z.object({
  paiementComedien: z.boolean(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ ligneId: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { ligneId } = await params;

    // Vérification multi-tenant : la ligne doit appartenir à un devis de cette société
    const ligne = await prisma.devisLigne.findFirst({
      where: { id: ligneId },
      select: {
        id: true,
        section: { select: { devis: { select: { companyId: true } } } },
      },
    });

    if (!ligne || ligne.section.devis.companyId !== user.companyId) {
      return Response.json({ error: "Ligne introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const { paiementComedien } = PaiementSchema.parse(body);

    const updated = await prisma.devisLigne.update({
      where: { id: ligneId },
      data: { paiementComedien },
      select: { id: true, paiementComedien: true },
    });

    return Response.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
