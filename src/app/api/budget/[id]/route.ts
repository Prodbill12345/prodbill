import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const LigneBudgetSchema = z.object({
  clientId: z.string().min(1),
  libelle: z.string().min(1),
  montantPrevisionnel: z.number().min(0),
});

const UpdateBudgetSchema = z.object({
  lignes: z.array(LigneBudgetSchema),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    const existing = await prisma.budgetPrevisionnel.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return Response.json({ error: "Budget introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const { lignes } = UpdateBudgetSchema.parse(body);

    const budget = await prisma.$transaction(async (tx) => {
      await tx.budgetLigne.deleteMany({ where: { budgetId: id } });
      return tx.budgetPrevisionnel.update({
        where: { id },
        data: {
          lignes: {
            create: lignes.map((l) => ({
              clientId: l.clientId,
              libelle: l.libelle,
              montantPrevisionnel: l.montantPrevisionnel,
            })),
          },
        },
        include: {
          lignes: { include: { client: { select: { id: true, name: true } } } },
        },
      });
    });

    return Response.json({ data: budget });
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

    const existing = await prisma.budgetPrevisionnel.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) {
      return Response.json({ error: "Budget introuvable" }, { status: 404 });
    }

    await prisma.budgetPrevisionnel.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
