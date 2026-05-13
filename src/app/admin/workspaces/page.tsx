import Link from "next/link";
import { Eye, Shield, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
});

const eurFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Couleurs déterministes pour l'avatar workspace, dérivées du nom
const palette = [
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
];
function colorFor(name: string) {
  return palette[name.charCodeAt(0) % palette.length];
}

interface WorkspaceRow {
  id: string;
  name: string;
  siret: string;
  slug: string;
  createdAt: Date;
  nbUsers: number;
  nbDevis: number;
  nbFactures: number;
  caPaye: number;
  caEnAttente: number;
}

async function fetchWorkspaces(): Promise<WorkspaceRow[]> {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      siret: true,
      createdAt: true,
      _count: { select: { users: true, devis: true, factures: true } },
    },
  });

  // Une seule passe d'agrégation pour les paiements par company
  const paiementAgg = await prisma.paiement.groupBy({
    by: ["companyId"],
    _sum: { montant: true },
  });
  const paidByCompany = new Map(
    paiementAgg.map((p) => [p.companyId, Number(p._sum.montant ?? 0)])
  );

  // CA "en attente" = Σ totalTtc des factures non clôturées (EMISE | PAYEE_PARTIEL
  // | EN_RETARD) moins les paiements déjà reçus sur ce périmètre. Approximation
  // Phase 1 ; un calcul exact nécessiterait de joindre Paiement.factureId.
  const enAttenteAgg = await prisma.facture.groupBy({
    by: ["companyId"],
    where: { statut: { in: ["EMISE", "PAYEE_PARTIEL", "EN_RETARD"] } },
    _sum: { totalTtc: true },
  });
  const emiseByCompany = new Map(
    enAttenteAgg.map((f) => [f.companyId, Number(f._sum.totalTtc ?? 0)])
  );

  return companies.map((c) => {
    const paye = paidByCompany.get(c.id) ?? 0;
    const emise = emiseByCompany.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      siret: c.siret,
      slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      createdAt: c.createdAt,
      nbUsers: c._count.users,
      nbDevis: c._count.devis,
      nbFactures: c._count.factures,
      caPaye: paye,
      caEnAttente: Math.max(0, emise - paye),
    };
  });
}

export default async function AdminWorkspacesPage() {
  const workspaces = await fetchWorkspaces();
  const totalUsers = workspaces.reduce((s, w) => s + w.nbUsers, 0);
  const totalCAPaye = workspaces.reduce((s, w) => s + w.caPaye, 0);

  return (
    <div className="space-y-6">
      {/* Header de page */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
          <Shield className="w-6 h-6 text-red-400" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Workspaces</h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {workspaces.length} workspace{workspaces.length > 1 ? "s" : ""} ·{" "}
            {totalUsers} utilisateur{totalUsers > 1 ? "s" : ""} · CA cumulé encaissé :{" "}
            <span className="font-semibold text-slate-700 tabular-nums">
              {eurFmt.format(totalCAPaye)}
            </span>
          </p>
        </div>
      </div>

      {workspaces.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Aucun workspace
          </h3>
          <p className="text-slate-400 text-sm">
            Créez-en un avec{" "}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">
              npx tsx scripts/create-workspace.ts
            </code>
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-5 py-3">Workspace</th>
                <th className="text-left font-semibold px-3 py-3">SIRET</th>
                <th className="text-left font-semibold px-3 py-3">Créé le</th>
                <th className="text-center font-semibold px-3 py-3">Users</th>
                <th className="text-center font-semibold px-3 py-3">Devis</th>
                <th className="text-center font-semibold px-3 py-3">Fact.</th>
                <th className="text-right font-semibold px-3 py-3">CA payé</th>
                <th className="text-right font-semibold px-3 py-3">En attente</th>
                <th className="text-right font-semibold px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => {
                const color = colorFor(w.name);
                return (
                  <tr
                    key={w.id}
                    className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center shrink-0`}
                        >
                          <span className={`${color.text} font-bold text-xs`}>
                            {w.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {w.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {w.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 font-mono text-xs text-slate-500">
                      {w.siret}
                    </td>
                    <td className="px-3 py-4 text-slate-600 text-xs">
                      {dateFmt.format(w.createdAt)}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-700 tabular-nums">
                      {w.nbUsers}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-700 tabular-nums">
                      {w.nbDevis}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-700 tabular-nums">
                      {w.nbFactures}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {w.caPaye > 0 ? (
                        <span className="font-semibold text-slate-900">
                          {eurFmt.format(w.caPaye)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {w.caEnAttente > 0 ? (
                        <span className="font-semibold text-amber-600">
                          {eurFmt.format(w.caEnAttente)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/workspaces/${w.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" strokeWidth={2.5} />
                          Détail
                        </Link>
                        <ImpersonateButton companyId={w.id} companyName={w.name} />
                      </div>
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
