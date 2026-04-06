import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import {
  FACTURE_STATUT_COLORS,
  FACTURE_STATUT_LABELS,
  FACTURE_TYPE_LABELS,
} from "@/types";
import Link from "next/link";
import { Receipt, AlertCircle, ChevronRight, TrendingUp, Clock } from "lucide-react";

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
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Aucune facture
          </h3>
          <p className="text-slate-400 text-sm">
            Les factures sont générées depuis les devis acceptés
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Numéro
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Client
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Émise le
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Échéance
                </th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total TTC
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Statut
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {factures.map((f) => {
                const totalPaye = f.paiements.reduce((s, p) => s + p.montant, 0);
                const isRetard =
                  f.statut === "EN_RETARD" ||
                  (f.statut === "EMISE" &&
                    f.dateEcheance &&
                    new Date(f.dateEcheance) < new Date());

                return (
                  <tr
                    key={f.id}
                    className={`transition-colors group ${
                      isRetard
                        ? "hover:bg-red-50/40 bg-red-50/20"
                        : "hover:bg-emerald-50/20"
                    }`}
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/factures/${f.id}`}
                        className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5"
                      >
                        {isRetard && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        {f.numero}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {f.client.name}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">
                      {FACTURE_TYPE_LABELS[f.type]}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">
                      {formatDate(f.dateEmission)}
                    </td>
                    <td
                      className={`px-5 py-4 text-sm font-medium ${
                        isRetard ? "text-red-600" : "text-slate-400 font-normal"
                      }`}
                    >
                      {formatDate(f.dateEcheance)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">
                        {formatEuros(f.totalTtc)}
                      </p>
                      {totalPaye > 0 && totalPaye < f.totalTtc && (
                        <p className="text-xs text-slate-400 tabular-nums">
                          Payé : {formatEuros(totalPaye)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${FACTURE_STATUT_COLORS[f.statut]}`}
                      >
                        {FACTURE_STATUT_LABELS[f.statut]}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
