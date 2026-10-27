import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { DevisListClient } from "@/components/devis/DevisListClient";
import {
  toFactureForFacturation,
  FACTURE_FACTURATION_SELECT,
} from "@/lib/devis-facturation-state";

export default async function DevisPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = scopedPrisma(user.companyId);
  const devis = await db.devis.findMany({
    include: {
      client: { select: { name: true } },
      bdc: { select: { numero: true } },
      // #99 : sélection multi pour facture récap — clientId/tauxTva/statut sont
      // déjà sur le modèle. On charge les factures liées (mono + récap via
      // FactureDevis) pour que la case à cocher applique exactement le même
      // garde-fou que la route (GUARD-DEVIS-DOUBLE-FACTURATION).
      factureLinks: { select: { facture: { select: FACTURE_FACTURATION_SELECT } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // On ne transmet au client que ce dont le prédicat a besoin (type/statut/
  // isRecap), pas les lignes Prisma complètes.
  const rows = devis.map(({ factureLinks, ...d }) => ({
    ...d,
    facturesLiees: factureLinks.map((l) => toFactureForFacturation(l.facture)),
  }));

  // Années disponibles pour le filtre — basées sur Devis.annee (saisi) en
  // priorité, sinon year(dateEmission). Cf. src/lib/devis-filters.ts.
  const availableYears = Array.from(
    new Set(
      devis
        .map((d) => d.annee ?? d.dateEmission?.getUTCFullYear() ?? null)
        .filter((y): y is number => y !== null)
    )
  ).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      {/* Header sticky */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Devis</h1>
          <p className="text-brand-ink-muted mt-0.5 text-sm">{devis.length} devis au total</p>
        </div>
        <Link
          href="/devis/nouveau"
          className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nouveau devis
        </Link>
      </div>

      {devis.length === 0 ? (
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-16 text-center">
          <div className="w-16 h-16 bg-brand-surface rounded-[var(--radius-card)] flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-brand-ink-muted" />
          </div>
          <h3 className="text-lg font-semibold text-brand-ink mb-2">
            Aucun devis
          </h3>
          <p className="text-brand-ink-muted mb-6 text-sm">
            Créez votre premier devis pour commencer
          </p>
          <Link
            href="/devis/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nouveau devis
          </Link>
        </div>
      ) : (
        <DevisListClient devis={rows} availableYears={availableYears} />
      )}
    </div>
  );
}
