import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { formatEuros } from "@/lib/calculations";
import { Receipt, TrendingUp, Clock } from "lucide-react";
import { FacturesListClient } from "@/components/factures/FacturesListClient";

export default async function FacturesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return null;

  const factures = await prisma.facture.findMany({
    where: { companyId: user.companyId },
    include: {
      client: { select: { name: true } },
      paiements: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const totalHtEmis = factures
    .filter((f) => f.statut !== "ANNULEE" && f.statut !== "BROUILLON")
    .reduce((s, f) => s + f.totalHt, 0);

  const totalEnAttente = factures
    .filter((f) => f.statut === "EMISE" || f.statut === "EN_RETARD" || f.statut === "PAYEE_PARTIEL")
    .reduce((s, f) => {
      const paye = f.paiements.reduce((sp, p) => sp + p.montant, 0);
      return s + Math.max(0, f.totalTtc - paye);
    }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures</h1>
          <p className="text-slate-500 mt-0.5 text-sm">{factures.length} factures</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">CA facturé (HT)</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {formatEuros(totalHtEmis)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">En attente</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
              {formatEuros(totalEnAttente)}
            </p>
          </div>
        </div>
      </div>

      {factures.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-8 h-8 text-emerald-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucune facture</h3>
          <p className="text-slate-400 text-sm">Les factures sont générées depuis les devis acceptés</p>
        </div>
      ) : (
        <FacturesListClient factures={factures} />
      )}
    </div>
  );
}
