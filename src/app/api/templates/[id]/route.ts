import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:delete");
    const { id } = await params;

    const template = await prisma.devisTemplate.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!template) {
      return Response.json({ error: "Modèle introuvable" }, { status: 404 });
    }

    if (template.userId !== user.id) {
      return Response.json({ error: "Seul le créateur peut supprimer ce modèle" }, { status: 403 });
    }

    await prisma.devisTemplate.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
