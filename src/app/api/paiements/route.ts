import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const CreatePaiementSchema = z.object({
  factureId: z.string().min(1),
  montant: z.number().positive(),
  date: z.string().min(1), // "YYYY-MM-DD" depuis <input type="date">
  reference: z.string().optional(),
  mode: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireAuth("paiement:read");

    const paiements = await prisma.paiement.findMany({
      where: { facture: { companyId: user.companyId } },
      include: {
        facture: { include: { client: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
    });

    return Response.json({ data: paiements });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("paiement:create");
    const body = await req.json();
    const input = CreatePaiementSchema.parse(body);

    // Vérifier que la facture appartient à cette société
    const facture = await prisma.facture.findFirst({
      where: { id: input.factureId, companyId: user.companyId },
      include: { paiements: true },
    });

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (facture.statut === "ANNULEE") {
      return Response.json({ error: "Facture annulée" }, { status: 400 });
    }

    if (facture.emiseAt === null) {
      return Response.json(
        { error: "La facture doit être émise avant d'enregistrer un paiement" },
        { status: 400 }
      );
    }

    const paiement = await prisma.paiement.create({
      data: {
        factureId: input.factureId,
        montant: input.montant,
        date: new Date(input.date),
        reference: input.reference,
        mode: input.mode,
        notes: input.notes,
      },
    });

    // Calculer le total payé et mettre à jour le statut
    const totalPaye =
      facture.paiements.reduce((s, p) => s + p.montant, 0) + input.montant;

    const newStatut =
      totalPaye >= facture.totalTtc
        ? "PAYEE"
        : totalPaye > 0
          ? "PAYEE_PARTIEL"
          : facture.statut;

    if (newStatut !== facture.statut) {
      await prisma.facture.update({
        where: { id: input.factureId },
        data: {
          statut: newStatut,
          ...(newStatut === "PAYEE" ? { datePaiement: new Date() } : {}),
        },
      });
    }

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "PAIEMENT_ENREGISTRE",
      entityType: "Paiement",
      entityId: paiement.id,
      details: {
        montant: input.montant,
        mode: input.mode,
        factureNumero: facture.numero,
        nouveauStatut: newStatut,
      },
      factureId: input.factureId,
    });

    return Response.json({ data: paiement }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
