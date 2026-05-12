import { requireAuth } from "@/lib/auth";
import { scopedPrisma } from "@/lib/scoped-prisma";
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
  const db = scopedPrisma(user.companyId);

  const [budget, devis, factures, clients, agents, comediens] = await Promise.all([
    db.budgetPrevisionnel.findUnique({
      where: { companyId_annee: { companyId: user.companyId, annee } },
      include: {
        lignes: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.devis.findMany({
      include: {
        client: { select: { id: true, name: true } },
        sections: {
          include: { lignes: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.facture.findMany({
      where: {
        statut: { in: ["PAYEE", "PAYEE_PARTIEL"] },
        dateEmission: {
          gte: new Date(annee, 0, 1),
          lte: new Date(annee, 11, 31, 23, 59, 59),
        },
      },
      select: { clientId: true, totalHt: true },
    }),
    db.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.agent.findMany({
      select: { id: true, nom: true, prenom: true, agence: true, tauxCommission: true },
      orderBy: [{ agence: "asc" }, { nom: "asc" }],
    }),
    db.comedien.findMany({
      select: { id: true, prenom: true, nom: true, agentId: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
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
      comediens={comediens}
    />
  );
}
