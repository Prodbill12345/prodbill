import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { formatEuros } from "@/lib/calculations";
import { TrendingUp, Clock } from "lucide-react";
import { FacturesListClient } from "@/components/factures/FacturesListClient";
import { Mascot } from "@/components/brand/Mascot";

export default async function FacturesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = scopedPrisma(user.companyId);
  const factures = await db.facture.findMany({
    include: {
      client: { select: { name: true } },
      paiements: true,
      // Pour la recherche libre : matche aussi numéro + objet du devis source
      devis: { select: { numero: true, objet: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Années disponibles pour le filtre — basées sur year(dateEmission).
  // Pas de champ `annee` sur Facture (contrairement à Devis).
  const availableYears = Array.from(
    new Set(
      factures
        .map((f) => (f.dateEmission ? f.dateEmission.getUTCFullYear() : null))
        .filter((y): y is number => y !== null)
    )
  ).sort((a, b) => b - a);

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
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Factures</h1>
          <p className="text-brand-ink-muted mt-0.5 text-sm">{factures.length} factures</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5 flex items-center gap-4 transition-shadow">
          <div className="w-10 h-10 rounded-[var(--radius-card)] bg-brand-surface flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-brand-ink" />
          </div>
          <div>
            <p className="text-xs text-brand-ink-muted font-medium uppercase tracking-wide">CA facturé (HT)</p>
            <p className="text-xl font-bold text-brand-ink mt-0.5 tabular-nums">
              {formatEuros(totalHtEmis)}
            </p>
          </div>
        </div>
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5 flex items-center gap-4 transition-shadow">
          <div className="w-10 h-10 rounded-[var(--radius-card)] bg-brand-surface flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-brand-ink" />
          </div>
          <div>
            <p className="text-xs text-brand-ink-muted font-medium uppercase tracking-wide">En attente</p>
            <p className="text-xl font-bold text-brand-ink mt-0.5 tabular-nums">
              {formatEuros(totalEnAttente)}
            </p>
          </div>
        </div>
      </div>

      {factures.length === 0 ? (
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-16 text-center">
          <Mascot size={88} className="mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold text-brand-ink mb-2">Aucune facture</h3>
          <p className="text-brand-ink-muted text-sm">Les factures sont générées depuis les devis acceptés</p>
        </div>
      ) : (
        <FacturesListClient factures={factures} availableYears={availableYears} />
      )}
    </div>
  );
}
