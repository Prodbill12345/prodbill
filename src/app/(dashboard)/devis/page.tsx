import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_COLORS, DEVIS_STATUT_LABELS } from "@/types";
import Link from "next/link";
import { Plus, FileText, ChevronRight } from "lucide-react";

export default async function DevisPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return null;

  const devis = await prisma.devis.findMany({
    where: { companyId: user.companyId },
    include: { client: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      {/* Header sticky */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Devis</h1>
          <p className="text-slate-500 mt-0.5 text-sm">{devis.length} devis au total</p>
        </div>
        <Link
          href="/devis/nouveau"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-900/20 hover:shadow-blue-900/30 transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nouveau devis
        </Link>
      </div>

      {devis.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-indigo-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Aucun devis
          </h3>
          <p className="text-slate-400 mb-6 text-sm">
            Créez votre premier devis pour commencer
          </p>
          <Link
            href="/devis/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nouveau devis
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Référence
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Client
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Objet
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Date
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
              {devis.map((d) => (
                <tr
                  key={d.id}
                  className="hover:bg-blue-50/30 transition-colors group"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/devis/${d.id}`}
                      className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors"
                    >
                      {d.numero ?? <span className="text-slate-400 font-normal italic">Brouillon</span>}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {d.client.name}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500 max-w-xs truncate">
                    {d.objet}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">
                    {formatDate(d.updatedAt)}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900 text-right tabular-nums">
                    {formatEuros(d.totalTtc)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${DEVIS_STATUT_COLORS[d.statut]}`}
                    >
                      {DEVIS_STATUT_LABELS[d.statut]}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
