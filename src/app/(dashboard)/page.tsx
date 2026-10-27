import { prisma } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { formatEuros } from "@/lib/calculations";
import { formatFactureNumero } from "@/lib/facture-numero";
import { DEVIS_STATUT_LABELS, FACTURE_STATUT_LABELS } from "@/types";
import Link from "next/link";
import {
  FileText,
  Receipt,
  Users,
  AlertCircle,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { CaChart, type MonthData } from "@/components/dashboard/CaChart";
import { Mascot } from "@/components/brand/Mascot";
import { Sticker } from "@/components/brand/Sticker";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { DEVIS_STATUT_TONE, FACTURE_STATUT_TONE } from "@/design/status";

const MOIS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const company = user
    ? await prisma.company.findUnique({ where: { id: user.companyId } })
    : null;

  if (!user || !company) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-brand-ink mb-2">
            Bienvenue sur ProdBill
          </h2>
          <p className="text-brand-ink-muted">Configuration de votre espace en cours...</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Phase 1.5 multi-tenant : helper scopedPrisma injecte companyId
  // automatiquement sur chaque query. Plus de filtre manuel à oublier.
  const db = scopedPrisma(user.companyId);
  const [
    devisEnvoyes,
    facturesEnCours,
    facturesEnRetardCount,
    recentDevis,
    recentFactures,
    facturesPayees6Mois,
  ] = await Promise.all([
    db.devis.count({ where: { statut: "ENVOYE" } }),
    db.facture.findMany({
      where: { statut: { in: ["EMISE", "PAYEE_PARTIEL", "EN_RETARD"] } },
      include: { paiements: true },
    }),
    db.facture.count({ where: { statut: "EN_RETARD" } }),
    db.devis.findMany({
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    db.facture.findMany({
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    // CA encaissé : factures PAYEE avec dateReglement renseignée
    // (Paiement n'est pas alimentée par l'import historique).
    db.facture.findMany({
      where: {
        statut: "PAYEE",
        dateReglement: { gte: startOf6Months, not: null },
      },
      select: { totalTtc: true, dateReglement: true },
    }),
  ]);

  const encaisseMonth = facturesPayees6Mois
    .filter((f) => f.dateReglement && new Date(f.dateReglement) >= startOfMonth)
    .reduce((s, f) => s + f.totalTtc, 0);

  const enAttenteTtc = facturesEnCours.reduce((s, f) => {
    const paye = f.paiements.reduce((sp, p) => sp + p.montant, 0);
    return s + Math.max(0, f.totalTtc - paye);
  }, 0);

  const enRetardTtc = facturesEnCours
    .filter((f) => {
      const paye = f.paiements.reduce((sp, p) => sp + p.montant, 0);
      return (
        f.dateEcheance &&
        new Date(f.dateEcheance) < now &&
        Math.max(0, f.totalTtc - paye) > 0.01
      );
    })
    .reduce((s, f) => {
      const paye = f.paiements.reduce((sp, p) => sp + p.montant, 0);
      return s + Math.max(0, f.totalTtc - paye);
    }, 0);

  const caParMois = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    caParMois.set(key, 0);
  }
  for (const f of facturesPayees6Mois) {
    if (!f.dateReglement) continue;
    const d = new Date(f.dateReglement);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (caParMois.has(key)) {
      caParMois.set(key, (caParMois.get(key) ?? 0) + f.totalTtc);
    }
  }
  const chartData: MonthData[] = Array.from(caParMois.entries()).map(([key, ca]) => {
    const [, m] = key.split("-").map(Number);
    return { label: MOIS_FR[m], ca };
  });

  // ── Présentation (DA ProdBill, phase 2 étape 3) ─────────────────────────
  const total6Mois = chartData.reduce((sum, d) => sum + d.ca, 0);
  const dateDuJour = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const card = "rounded-[var(--radius-card)] border border-brand-rule bg-brand-paper";
  const annotation = "text-[10px] font-medium tracking-[0.2em] uppercase text-brand-ink-muted";

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* ── Héros éditorial ─────────────────────────────────────── */}
      <section className={`relative overflow-hidden ${card} px-5 pt-6 pb-7 sm:px-8 sm:pt-8 sm:pb-9`}>
        <p className={annotation}>
          {dateDuJour} · {company.name}
        </p>
        <h1 className="mt-3 sm:pr-56 font-display text-[30px] sm:text-[44px] font-bold leading-[1.04] tracking-[-0.035em] text-brand-ink">
          Bonjour {company.name},
          <br />
          {enRetardTtc > 0 ? (
            <>
              quelques factures{" "}
              <em className="font-editorial font-normal italic tracking-normal text-brand-blue">traînent</em>.
            </>
          ) : (
            <>
              tout roule,{" "}
              <em className="font-editorial font-normal italic tracking-normal text-brand-blue">tranquille</em>.
            </>
          )}
        </h1>
        <div className="mt-6 flex flex-wrap gap-2.5 pr-28 sm:pr-0">
          <Link
            href="/devis/nouveau"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--radius-control)] text-[13px] font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Nouveau devis
          </Link>
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--radius-control)] text-[13px] font-medium text-brand-ink border border-brand-rule bg-brand-cream hover:bg-brand-surface"
          >
            <Users className="w-4 h-4" strokeWidth={1.75} />
            Nouveau client
          </Link>
        </div>

        {/* Mascotte, portrait coupé par le bas de la carte, + sticker */}
        <div className="pointer-events-none absolute bottom-0 right-3 sm:right-10">
          <Mascot size={150} className="hidden sm:block" />
          <Mascot size={92} className="sm:hidden" />
          <Sticker className="absolute -top-3 -left-6 sm:-left-8" size={68} rotate={-12}>
            on
            <br />
            gère
          </Sticker>
        </div>
      </section>

      {/* ── Chiffres ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Chiffre principal : grande carte bleue, texte crème */}
        <div className="col-span-2 rounded-[var(--radius-card)] bg-brand-blue text-brand-cream p-6 flex flex-col justify-between min-h-[168px]">
          <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-brand-cream/80">
            Encaissé ce mois · TTC
          </p>
          <div>
            <p className="font-display text-[40px] sm:text-[48px] font-bold leading-none tracking-[-0.03em] tabular-nums">
              {formatEuros(encaisseMonth)}
            </p>
            <p className="mt-2 text-sm text-brand-cream/80 tabular-nums">
              {formatEuros(total6Mois)} sur 6 mois
            </p>
          </div>
        </div>

        {/* En attente */}
        <Link href="/paiements" className={`${card} p-4 sm:p-5 flex flex-col justify-between gap-6 hover:border-brand-ink-subtle`}>
          <span className="flex items-center justify-between">
            <span className={annotation}>En attente</span>
            <ArrowUpRight className="w-4 h-4 text-brand-ink-muted" strokeWidth={1.75} />
          </span>
          <span className="font-display text-xl sm:text-2xl font-bold tracking-[-0.02em] text-brand-ink tabular-nums">
            {formatEuros(enAttenteTtc)}
          </span>
        </Link>

        {/* En retard : pastille rouge orangé si > 0 */}
        <Link href="/factures" className={`${card} p-4 sm:p-5 flex flex-col justify-between gap-6 hover:border-brand-ink-subtle`}>
          <span className="flex items-center justify-between">
            <span className={`${annotation} inline-flex items-center gap-1.5`}>
              {/* Alerte dès qu'un montant est échu (même condition que l'ancien
                  fond rouge) — pas seulement sur le statut EN_RETARD. */}
              {enRetardTtc > 0 && <span className="h-2 w-2 rounded-full bg-brand-coral" aria-hidden />}
              En retard
            </span>
            {facturesEnRetardCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFE1D8] px-2 py-0.5 text-xs font-semibold text-brand-ink tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-coral" aria-hidden />
                {facturesEnRetardCount}
                <span className="sr-only"> facture(s) en retard</span>
              </span>
            )}
          </span>
          <span
            className={`font-display text-xl sm:text-2xl font-bold tracking-[-0.02em] tabular-nums ${
              enRetardTtc > 0 ? "text-brand-ink" : "text-brand-ink-muted"
            }`}
          >
            {formatEuros(enRetardTtc)}
          </span>
        </Link>

        {/* Devis envoyés */}
        <Link href="/devis" className={`${card} p-4 sm:p-5 flex flex-col justify-between gap-6 hover:border-brand-ink-subtle col-span-2 lg:col-span-1`}>
          <span className="flex items-center justify-between">
            <span className={annotation}>Devis envoyés</span>
            <ArrowUpRight className="w-4 h-4 text-brand-ink-muted" strokeWidth={1.75} />
          </span>
          <span className="font-display text-xl sm:text-2xl font-bold tracking-[-0.02em] text-brand-ink tabular-nums">
            {devisEnvoyes}
          </span>
        </Link>
      </div>

      {/* ── Graphique + activité récente ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className={`lg:col-span-2 ${card} p-6`}>
          <div className="mb-6">
            <p className={annotation}>6 derniers mois · TTC</p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-brand-ink">CA encaissé</h2>
          </div>
          <CaChart data={chartData} />
        </div>

        <div className={`lg:col-span-3 ${card} flex flex-col min-h-0`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-rule shrink-0">
            <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-brand-ink">Activité récente</h2>
            <div className="flex gap-4">
              <Link href="/devis" className="text-xs font-medium text-brand-ink-muted hover:text-brand-ink flex items-center gap-0.5">
                Devis <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
              </Link>
              <Link href="/factures" className="text-xs font-medium text-brand-ink-muted hover:text-brand-ink flex items-center gap-0.5">
                Factures <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
              </Link>
            </div>
          </div>

          {/* Devis */}
          <div className="px-6 pt-4 pb-1 shrink-0">
            <p className={annotation}>Devis</p>
          </div>
          <div className="shrink-0">
            {recentDevis.length === 0 ? (
              <p className="px-6 py-3 text-sm text-brand-ink-muted">Aucun devis pour l&apos;instant.</p>
            ) : (
              recentDevis.slice(0, 3).map((devis) => (
                <Link
                  key={devis.id}
                  href={`/devis/${devis.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-2.5 hover:bg-brand-surface/60 group"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[var(--radius-control)] bg-brand-surface flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-brand-ink" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-ink truncate">
                        {devis.numero ?? <span className="text-brand-ink-muted font-normal">Brouillon</span>}
                        {devis.objet ? ` · ${devis.objet}` : ""}
                      </p>
                      <p className="text-xs text-brand-ink-muted">{devis.client.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="hidden sm:inline font-display text-sm font-semibold text-brand-ink tabular-nums">
                      {formatEuros(devis.totalTtc)}
                    </span>
                    <StatusBadge tone={DEVIS_STATUT_TONE[devis.statut]} label={DEVIS_STATUT_LABELS[devis.statut]} />
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Factures */}
          <div className="px-6 pt-3 pb-1 mt-1 border-t border-brand-rule shrink-0">
            <p className={annotation}>Factures</p>
          </div>
          <div className="shrink-0 pb-2">
            {recentFactures.length === 0 ? (
              <p className="px-6 py-3 text-sm text-brand-ink-muted">Aucune facture pour l&apos;instant.</p>
            ) : (
              recentFactures.slice(0, 3).map((facture) => {
                const isRetard =
                  facture.statut === "EN_RETARD" ||
                  (["EMISE", "PAYEE_PARTIEL"].includes(facture.statut) &&
                    facture.dateEcheance != null &&
                    new Date(facture.dateEcheance) < now);
                return (
                  <Link
                    key={facture.id}
                    href={`/factures/${facture.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-2.5 hover:bg-brand-surface/60 group"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[var(--radius-control)] bg-brand-surface flex items-center justify-center shrink-0">
                        <Receipt className="w-3.5 h-3.5 text-brand-ink" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-ink truncate flex items-center gap-1.5">
                          {isRetard && (
                            <AlertCircle className="w-3.5 h-3.5 text-brand-coral shrink-0" strokeWidth={2} aria-label="Échéance dépassée" />
                          )}
                          {formatFactureNumero(facture)}
                        </p>
                        <p className="text-xs text-brand-ink-muted">{facture.client.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="hidden sm:inline font-display text-sm font-semibold text-brand-ink tabular-nums">
                        {formatEuros(facture.totalTtc)}
                      </span>
                      <StatusBadge tone={FACTURE_STATUT_TONE[facture.statut]} label={FACTURE_STATUT_LABELS[facture.statut]} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
