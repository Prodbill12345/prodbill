import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateBudgetSchema = z.object({
  annee: z.number().int().min(2000).max(2100),
});

export async function GET(req: Request) {
  try {
    const user = await requireAuth("devis:read");
    const url = new URL(req.url);
    const annee = parseInt(url.searchParams.get("annee") ?? String(new Date().getFullYear()), 10);

    const budget = await prisma.budgetPrevisionnel.findUnique({
      where: { companyId_annee: { companyId: user.companyId, annee } },
      include: {
        lignes: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // CA réalisé par client pour l'année (factures PAYEE ou PAYEE_PARTIEL)
    const factures = await prisma.facture.findMany({
      where: {
        companyId: user.companyId,
        statut: { in: ["PAYEE", "PAYEE_PARTIEL"] },
        dateEmission: {
          gte: new Date(annee, 0, 1),
          lte: new Date(annee, 11, 31, 23, 59, 59),
        },
      },
      select: { clientId: true, totalHt: true },
    });

    const caParClient: Record<string, number> = {};
    for (const f of factures) {
      caParClient[f.clientId] = (caParClient[f.clientId] ?? 0) + f.totalHt;
    }

    return Response.json({ data: { budget, caParClient } });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("devis:edit");
    const body = await req.json();
    const { annee } = CreateBudgetSchema.parse(body);

    const budget = await prisma.budgetPrevisionnel.upsert({
      where: { companyId_annee: { companyId: user.companyId, annee } },
      create: { companyId: user.companyId, annee },
      update: {},
      include: { lignes: { include: { client: { select: { id: true, name: true } } } } },
    });

    return Response.json({ data: budget }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
