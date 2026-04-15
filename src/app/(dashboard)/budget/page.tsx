import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { BudgetClient } from "@/components/budget/BudgetClient";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  let user;
  try {
    user = await requireAuth("devis:read");
  } catch {
    redirect("/sign-in");
  }

  const annee = new Date().getFullYear();

  const [budget, devis, factures, clients, agents] = await Promise.all([
    prisma.budgetPrevisionnel.findUnique({
      where: { companyId_annee: { companyId: user.companyId, annee } },
      include: {
        lignes: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.devis.findMany({
      where: { companyId: user.companyId },
      include: {
        client: { select: { id: true, name: true } },
        sections: {
          include: { lignes: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.facture.findMany({
      where: {
        companyId: user.companyId,
        statut: { in: ["PAYEE", "PAYEE_PARTIEL"] },
        dateEmission: {
          gte: new Date(annee, 0, 1),
          lte: new Date(annee, 11, 31, 23, 59, 59),
        },
      },
      select: { clientId: true, totalHt: true },
    }),
    prisma.client.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.agent.findMany({
      where: { companyId: user.companyId },
      select: { id: true, nom: true, prenom: true, agence: true, tauxCommission: true },
      orderBy: [{ agence: "asc" }, { nom: "asc" }],
    }),
  ]);

  // CA réalisé par client
  const caParClient: Record<string, number> = {};
  for (const f of factures) {
    caParClient[f.clientId] = (caParClient[f.clientId] ?? 0) + f.totalHt;
  }

  return (
    <BudgetClient
      annee={annee}
      budget={budget}
      caParClient={caParClient}
      devis={devis}
      clients={clients}
      agents={agents}
    />
  );
}
