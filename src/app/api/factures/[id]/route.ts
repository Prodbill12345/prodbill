import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
