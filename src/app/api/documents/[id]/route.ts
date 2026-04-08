import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("parametres:edit");
    const { id } = await params;

    const doc = await prisma.document.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!doc) {
      return Response.json({ error: "Document introuvable" }, { status: 404 });
    }

    await del(doc.url);
    await prisma.document.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
