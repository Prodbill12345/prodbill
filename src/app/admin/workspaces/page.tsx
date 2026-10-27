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
  { bg: "bg-status-info-bg", text: "text-brand-blue" },
  { bg: "bg-status-info-bg", text: "text-brand-blue" },
  { bg: "bg-status-success-bg", text: "text-brand-pistachio-ink" },
  { bg: "bg-status-partial-bg", text: "text-brand-ink" },
  { bg: "bg-status-danger-bg", text: "text-brand-coral-ink" },
  { bg: "bg-status-info-bg", text: "text-brand-blue" },
  { bg: "bg-status-success-bg", text: "text-brand-pistachio-ink" },
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

  // ─── Calcul CA payé / en attente — strategie hybride ─────────────────────
  // Le statut Facture est la source de vérité prioritaire (les imports
  // historiques marquent PAYEE sans créer de Paiement). Les Paiements ne
  // comptent que pour les PAYEE_PARTIEL (règlements en cours).
  //
  //   PAYEE          → totalTtc dans caPaye
  //   PAYEE_PARTIEL  → Σ Paiement.montant lies dans caPaye
  //                    (totalTtc − Σ Paiement) dans caEnAttente
  //   EMISE/EN_RETARD→ totalTtc dans caEnAttente
  //   BROUILLON/ANNULEE → ignore
  const [fullyPaidAgg, partialPaiementsAgg, partialFacturesAgg, openAgg] =
    await Promise.all([
      prisma.facture.groupBy({
        by: ["companyId"],
        where: { statut: "PAYEE" },
        _sum: { totalTtc: true },
      }),
      prisma.paiement.groupBy({
        by: ["companyId"],
        where: { facture: { statut: "PAYEE_PARTIEL" } },
        _sum: { montant: true },
      }),
      prisma.facture.groupBy({
        by: ["companyId"],
        where: { statut: "PAYEE_PARTIEL" },
        _sum: { totalTtc: true },
      }),
      prisma.facture.groupBy({
        by: ["companyId"],
        where: { statut: { in: ["EMISE", "EN_RETARD"] } },
        _sum: { totalTtc: true },
      }),
    ]);

  const fullyPaid = new Map(
    fullyPaidAgg.map((r) => [r.companyId, Number(r._sum.totalTtc ?? 0)])
  );
  const partialPaiements = new Map(
    partialPaiementsAgg.map((r) => [r.companyId, Number(r._sum.montant ?? 0)])
  );
  const partialFactures = new Map(
    partialFacturesAgg.map((r) => [r.companyId, Number(r._sum.totalTtc ?? 0)])
  );
  const open = new Map(
    openAgg.map((r) => [r.companyId, Number(r._sum.totalTtc ?? 0)])
  );

  return companies.map((c) => {
    const fp = fullyPaid.get(c.id) ?? 0;
    const pp = partialPaiements.get(c.id) ?? 0;
    const pf = partialFactures.get(c.id) ?? 0;
    const op = open.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      siret: c.siret,
      slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      createdAt: c.createdAt,
      nbUsers: c._count.users,
      nbDevis: c._count.devis,
      nbFactures: c._count.factures,
      caPaye: fp + pp,
      caEnAttente: op + Math.max(0, pf - pp),
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
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-[var(--radius-card)] bg-brand-ink flex items-center justify-center shrink-0">
          <Shield className="w-6 h-6 text-brand-coral" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Workspaces</h1>
          <p className="text-brand-ink-muted mt-0.5 text-sm">
            {workspaces.length} workspace{workspaces.length > 1 ? "s" : ""} ·{" "}
            {totalUsers} utilisateur{totalUsers > 1 ? "s" : ""} · CA cumulé encaissé :{" "}
            <span className="font-semibold text-brand-ink tabular-nums">
              {eurFmt.format(totalCAPaye)}
            </span>
          </p>
        </div>
      </div>

      {workspaces.length === 0 ? (
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-16 text-center">
          <div className="w-16 h-16 bg-brand-surface rounded-[var(--radius-card)] flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-brand-ink-subtle" />
          </div>
          <h3 className="text-lg font-semibold text-brand-ink mb-2">
            Aucun workspace
          </h3>
          <p className="text-brand-ink-muted text-sm">
            Créez-en un avec{" "}
            <code className="px-1.5 py-0.5 bg-brand-surface rounded text-xs font-mono">
              npx tsx scripts/create-workspace.ts
            </code>
          </p>
        </div>
      ) : (
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface text-brand-ink-muted text-xs uppercase tracking-wide">
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
                    className="border-t border-brand-rule hover:bg-brand-surface/60 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-[var(--radius-control)] ${color.bg} flex items-center justify-center shrink-0`}
                        >
                          <span className={`${color.text} font-bold text-xs`}>
                            {w.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-brand-ink truncate">
                            {w.name}
                          </div>
                          <div className="text-xs text-brand-ink-muted truncate">
                            {w.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 font-mono text-xs text-brand-ink-muted">
                      {w.siret}
                    </td>
                    <td className="px-3 py-4 text-brand-ink-muted text-xs">
                      {dateFmt.format(w.createdAt)}
                    </td>
                    <td className="px-3 py-4 text-center text-brand-ink tabular-nums">
                      {w.nbUsers}
                    </td>
                    <td className="px-3 py-4 text-center text-brand-ink tabular-nums">
                      {w.nbDevis}
                    </td>
                    <td className="px-3 py-4 text-center text-brand-ink tabular-nums">
                      {w.nbFactures}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {w.caPaye > 0 ? (
                        <span className="font-semibold text-brand-ink">
                          {eurFmt.format(w.caPaye)}
                        </span>
                      ) : (
                        <span className="text-brand-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {w.caEnAttente > 0 ? (
                        <span className="font-semibold text-brand-ink">
                          {eurFmt.format(w.caEnAttente)}
                        </span>
                      ) : (
                        <span className="text-brand-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/workspaces/${w.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold text-brand-ink bg-brand-paper border border-brand-rule hover:bg-brand-surface transition-all"
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
