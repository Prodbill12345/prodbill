/**
 * POST /api/devis/[id]/dupliquer
 *
 * Duplique un devis existant en un nouveau brouillon dans la meme company.
 * Tout statut est autorise (BROUILLON, ENVOYE, ACCEPTE, REFUSE, EXPIRE) —
 * Vanda peut typiquement vouloir partir d'un devis accepte pour proposer
 * une variante a un autre client. Ticket #93.
 *
 * Reset cote nouveau devis : numero, statut=BROUILLON, dateEmission=null,
 * pdfUrl=null, bdcClient*=null. Trace via devisSourceId.
 *
 * Audit : action DEVIS_DUPLIQUE.
 */

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { buildDuplicatedDevisData } from "@/lib/devis-duplicate";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:create");
    const { id } = await params;

    // 1. Charger le devis source avec son arborescence sections/lignes
    const source = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        sections: {
          orderBy: { ordre: "asc" },
          include: {
            lignes: { orderBy: { ordre: "asc" } },
          },
        },
      },
    });

    if (!source) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    // 2. Construire le data via helper pur (testable) + create
    const data = buildDuplicatedDevisData(source, {
      currentUserId: user.id,
      currentCompanyId: user.companyId,
    });

    const created = await prisma.devis.create({
      data,
      select: { id: true },
    });

    // 3. Audit
    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "DEVIS_DUPLIQUE",
      entityType: "Devis",
      entityId: created.id,
      details: { sourceId: source.id, sourceNumero: source.numero },
      devisId: created.id,
    });

    return Response.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
