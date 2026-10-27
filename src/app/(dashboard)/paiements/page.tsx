import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { PaiementsClient, type FactureRow } from "@/components/paiements/PaiementsClient";
import { formatFactureNumero } from "@/lib/facture-numero";
import Link from "next/link";

function joursEntre(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Pénalités de retard : 15%/an sur le capital restant dû */
function calculerPenalites(resteAPayer: number, joursRetard: number): number {
  if (joursRetard <= 0) return 0;
  return Math.round(resteAPayer * 0.15 * (joursRetard / 365) * 100) / 100;
}

export default async function PaiementsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const db = scopedPrisma(user.companyId);
  const [facturesRaw, paiementsRecents] = await Promise.all([
    db.facture.findMany({
      where: {
        statut: { not: "BROUILLON" },
        type: { not: "AVOIR" },
      },
      include: {
        client: { select: { name: true } },
        paiements: true,
      },
      orderBy: [{ dateEcheance: "asc" }, { createdAt: "desc" }],
    }),
    db.paiement.findMany({
      include: {
        facture: { include: { client: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  // Enrichir les factures
  const factures: FactureRow[] = facturesRaw.map((f) => {
    const paye = f.paiements.reduce((s, p) => s + p.montant, 0);
    const resteAPayer = Math.max(0, f.totalTtc - paye);
    const joursRetard =
      f.dateEcheance && resteAPayer > 0.01
        ? Math.max(0, joursEntre(new Date(f.dateEcheance), now))
        : 0;
    return {
      id: f.id,
      numero: f.numero,
      type: f.type,
      statut: f.statut,
      totalTtc: f.totalTtc,
      totalHt: f.totalHt,
      resteAPayer,
      dateEcheance: f.dateEcheance,
      joursRetard,
      penalites: calculerPenalites(resteAPayer, joursRetard),
      clientName: f.client.name,
    };
  });

  // KPIs
  const totalEnAttente = factures
    .filter((f) => ["EMISE", "PAYEE_PARTIEL", "EN_RETARD"].includes(f.statut))
    .reduce((s, f) => s + f.resteAPayer, 0);

  const enRetard = factures.filter((f) => f.joursRetard > 0);
  const totalEnRetard = enRetard.reduce((s, f) => s + f.resteAPayer, 0);
  const totalPenalites = enRetard.reduce((s, f) => s + f.penalites, 0);

  const encaisseMonth = paiementsRecents
    .filter((p) => new Date(p.date) >= startOfMonth)
    .reduce((s, p) => s + p.montant, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Paiements</h1>
        <p className="text-brand-ink-muted mt-1">Suivi des encaissements</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-brand-pistachio-ink" />
            <p className="text-sm text-brand-ink-muted">Encaissé ce mois</p>
          </div>
          <p className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">
            {formatEuros(encaisseMonth)}
          </p>
        </div>

        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-brand-blue" />
            <p className="text-sm text-brand-ink-muted">En attente</p>
          </div>
          <p className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">
            {formatEuros(totalEnAttente)}
          </p>
        </div>

        <div
          className={`rounded-[var(--radius-card)] border p-5 ${
            enRetard.length > 0
              ? "bg-status-danger-bg border-status-danger-bg"
              : "bg-brand-paper border-brand-rule"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle
              className={`w-4 h-4 ${enRetard.length > 0 ? "text-brand-coral-ink" : "text-brand-ink-muted"}`}
            />
            <p
              className={`text-sm ${enRetard.length > 0 ? "text-brand-coral-ink" : "text-brand-ink-muted"}`}
            >
              En retard ({enRetard.length})
            </p>
          </div>
          <p
            className={`font-display text-2xl font-bold tracking-[-0.02em] ${
              enRetard.length > 0 ? "text-brand-ink" : "text-brand-ink"
            }`}
          >
            {formatEuros(totalEnRetard)}
          </p>
        </div>

        <div
          className={`rounded-[var(--radius-card)] border p-5 ${
            totalPenalites > 0
              ? "bg-status-partial-bg border-status-partial-bg"
              : "bg-brand-paper border-brand-rule"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle
              className={`w-4 h-4 ${totalPenalites > 0 ? "text-brand-coral" : "text-brand-ink-muted"}`}
            />
            <p
              className={`text-sm ${totalPenalites > 0 ? "text-brand-coral-ink" : "text-brand-ink-muted"}`}
            >
              Pénalités dues (15%/an)
            </p>
          </div>
          <p
            className={`font-display text-2xl font-bold tracking-[-0.02em] ${
              totalPenalites > 0 ? "text-brand-ink" : "text-brand-ink"
            }`}
          >
            {formatEuros(totalPenalites)}
          </p>
          {totalPenalites > 0 && (
            <p className="text-xs text-brand-coral-ink mt-1">+ indemnité 40 € / facture</p>
          )}
        </div>
      </div>

      {/* Alerte factures en retard */}
      {enRetard.length > 0 && (
        <div className="flex items-center gap-3 bg-status-danger-bg border border-status-danger-bg rounded-[var(--radius-card)] px-5 py-3.5 text-sm text-brand-ink">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>{enRetard.length} facture{enRetard.length > 1 ? "s" : ""}</strong> dépassent
            la date d&apos;échéance.
            {totalPenalites > 0 && (
              <> Pénalités de retard calculées : <strong>{formatEuros(totalPenalites)}</strong> + 40 € d&apos;indemnité forfaitaire par facture.</>
            )}
          </span>
        </div>
      )}

      {/* Tableau des factures */}
      <PaiementsClient factures={factures} />

      {/* Historique paiements */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-rule">
          <h2 className="font-semibold text-brand-ink">Historique des paiements</h2>
          <span className="text-xs text-brand-ink-muted">{paiementsRecents.length} entrées récentes</span>
        </div>
        {paiementsRecents.length === 0 ? (
          <p className="px-5 py-10 text-center text-brand-ink-muted text-sm">
            Aucun paiement enregistré
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-rule">
                <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Date</th>
                <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Facture</th>
                <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Client</th>
                <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Mode</th>
                <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Référence</th>
                <th className="text-right px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-rule">
              {paiementsRecents.map((p) => (
                <tr key={p.id} className="hover:bg-brand-surface">
                  <td className="px-5 py-3.5 text-sm text-brand-ink-muted">
                    {formatDate(p.date)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/factures/${p.factureId}`}
                      className="text-sm font-medium text-brand-blue hover:text-brand-blue"
                    >
                      {formatFactureNumero(p.facture)}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-brand-ink">
                    {p.facture.client.name}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-brand-ink-muted capitalize">
                    {p.mode ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-brand-ink-muted font-mono">
                    {p.reference ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-right tabular-nums text-brand-pistachio-ink">
                    +{formatEuros(p.montant)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
