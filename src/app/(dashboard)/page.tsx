import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { formatEuros } from "@/lib/calculations";
import {
  DEVIS_STATUT_COLORS,
  DEVIS_STATUT_LABELS,
  FACTURE_STATUT_COLORS,
  FACTURE_STATUT_LABELS,
} from "@/types";
import Link from "next/link";
import {
  FileText,
  Receipt,
  Users,
  TrendingUp,
  AlertCircle,
  Plus,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { CaChart, type MonthData } from "@/components/dashboard/CaChart";

const MOIS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { company: true },
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Bienvenue sur ProdBill
          </h2>
          <p className="text-slate-500">Configuration de votre espace en cours...</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    devisEnvoyes,
    facturesEnCours,
    facturesEnRetardCount,
    recentDevis,
    recentFactures,
    paiements6Mois,
  ] = await Promise.all([
    prisma.devis.count({ where: { companyId: user.companyId, statut: "ENVOYE" } }),
    prisma.facture.findMany({
      where: {
        companyId: user.companyId,
        statut: { in: ["EMISE", "PAYEE_PARTIEL", "EN_RETARD"] },
      },
      include: { paiements: true },
    }),
    prisma.facture.count({
      where: { companyId: user.companyId, statut: "EN_RETARD" },
    }),
    prisma.devis.findMany({
      where: { companyId: user.companyId },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    prisma.facture.findMany({
      where: { companyId: user.companyId },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    prisma.paiement.findMany({
      where: {
        facture: { companyId: user.companyId },
        date: { gte: startOf6Months },
      },
      select: { montant: true, date: true },
    }),
  ]);

  const encaisseMonth = paiements6Mois
    .filter((p) => new Date(p.date) >= startOfMonth)
    .reduce((s, p) => s + p.montant, 0);

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
  for (const p of paiements6Mois) {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (caParMois.has(key)) {
      caParMois.set(key, (caParMois.get(key) ?? 0) + p.montant);
    }
  }
  const chartData: MonthData[] = Array.from(caParMois.entries()).map(([key, ca]) => {
    const [, m] = key.split("-").map(Number);
    return { label: MOIS_FR[m], ca };
  });

  // Statut → icône colorée pour les factures
  const factureStatutIcon = (statut: string, isRetard: boolean) => {
    if (isRetard || statut === "EN_RETARD")
      return { bg: "bg-red-50", icon: "text-red-400" };
    if (statut === "PAYEE")
      return { bg: "bg-emerald-50", icon: "text-emerald-500" };
    if (statut === "PAYEE_PARTIEL")
      return { bg: "bg-amber-50", icon: "text-amber-500" };
    return { bg: "bg-blue-50", icon: "text-blue-400" };
  };

  // Statut → icône colorée pour les devis
  const devisStatutIcon = (statut: string) => {
    if (statut === "ACCEPTE") return { bg: "bg-emerald-50", icon: "text-emerald-500" };
    if (statut === "REFUSE" || statut === "EXPIRE") return { bg: "bg-red-50", icon: "text-red-400" };
    if (statut === "ENVOYE") return { bg: "bg-blue-50", icon: "text-blue-500" };
    return { bg: "bg-slate-50", icon: "text-slate-400" };
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Bonjour,{" "}
            <span className="text-blue-600">{user.company.name}</span>{" "}
            👋
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 capitalize">
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link
            href="/clients/nouveau"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <Users className="w-4 h-4 text-slate-400" />
            Nouveau client
          </Link>
          <Link
            href="/devis/nouveau"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-900/20 hover:shadow-lg hover:shadow-blue-900/25 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nouveau devis
          </Link>
        </div>
      </div>

      {/* KPIs — couleurs distinctes par card */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Encaissé — vert */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-100 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-900 tabular-nums leading-none">
            {formatEuros(encaisseMonth)}
          </p>
          <p className="text-sm text-emerald-700/70 mt-1.5 font-medium">Encaissé ce mois</p>
        </div>

        {/* En attente — bleu */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-100 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <Link href="/paiements" className="text-blue-400 hover:text-blue-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-2xl font-bold text-blue-900 tabular-nums leading-none">
            {formatEuros(enAttenteTtc)}
          </p>
          <p className="text-sm text-blue-700/70 mt-1.5 font-medium">En attente</p>
        </div>

        {/* En retard — orange/rouge */}
        <div className={`rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow ${
          enRetardTtc > 0
            ? "bg-gradient-to-br from-red-50 to-orange-50/60 border-red-100"
            : "bg-gradient-to-br from-slate-50 to-slate-100/60 border-slate-100"
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <AlertCircle className={`w-5 h-5 ${enRetardTtc > 0 ? "text-red-500" : "text-slate-300"}`} />
            </div>
            {facturesEnRetardCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                {facturesEnRetardCount}
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold tabular-nums leading-none ${
            enRetardTtc > 0 ? "text-red-800" : "text-slate-400"
          }`}>
            {formatEuros(enRetardTtc)}
          </p>
          <p className={`text-sm mt-1.5 font-medium ${enRetardTtc > 0 ? "text-red-600/70" : "text-slate-400"}`}>
            En retard
          </p>
        </div>

        {/* Devis en attente — violet */}
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50/60 rounded-2xl border border-violet-100 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <FileText className="w-5 h-5 text-violet-500" />
            </div>
            <Link href="/devis" className="text-violet-400 hover:text-violet-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-2xl font-bold text-violet-900 tabular-nums leading-none">
            {devisEnvoyes}
          </p>
          <p className="text-sm text-violet-700/70 mt-1.5 font-medium">Devis envoyés</p>
        </div>
      </div>

      {/* Graphique + activité récente */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Graphique CA — occupe 2/5 */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold text-slate-900">CA encaissé</h2>
              <p className="text-xs text-slate-400 mt-0.5">6 derniers mois · TTC</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <CaChart data={chartData} />
        </div>

        {/* Activité récente — occupe 3/5 */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <h2 className="font-semibold text-slate-900">Activité récente</h2>
            <div className="flex gap-4">
              <Link href="/devis" className="text-xs text-slate-400 hover:text-indigo-600 font-medium transition-colors flex items-center gap-0.5">
                Devis <ArrowUpRight className="w-3 h-3" />
              </Link>
              <Link href="/factures" className="text-xs text-slate-400 hover:text-emerald-600 font-medium transition-colors flex items-center gap-0.5">
                Factures <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Devis */}
          <div className="px-6 pt-4 pb-1 shrink-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Devis</p>
          </div>
          <div className="shrink-0">
            {recentDevis.length === 0 ? (
              <p className="px-6 py-3 text-sm text-slate-400 italic">Aucun devis</p>
            ) : (
              recentDevis.slice(0, 3).map((devis) => {
                const colors = devisStatutIcon(devis.statut);
                return (
                  <Link
                    key={devis.id}
                    href={`/devis/${devis.id}`}
                    className="flex items-center justify-between px-6 py-2.5 hover:bg-slate-50/80 transition-colors group"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                        <FileText className={`w-3.5 h-3.5 ${colors.icon}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                          {devis.numero ?? <span className="italic text-slate-400 font-normal">Brouillon</span>}
                          {devis.objet ? ` · ${devis.objet}` : ""}
                        </p>
                        <p className="text-xs text-slate-400">{devis.client.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 ml-4 shrink-0">
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {formatEuros(devis.totalTtc)}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DEVIS_STATUT_COLORS[devis.statut]}`}>
                        {DEVIS_STATUT_LABELS[devis.statut]}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Factures */}
          <div className="px-6 pt-3 pb-1 mt-1 border-t border-slate-50 shrink-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Factures</p>
          </div>
          <div className="shrink-0">
            {recentFactures.length === 0 ? (
              <p className="px-6 py-3 text-sm text-slate-400 italic">Aucune facture</p>
            ) : (
              recentFactures.slice(0, 3).map((facture) => {
                const isRetard =
                  facture.statut === "EN_RETARD" ||
                  (["EMISE", "PAYEE_PARTIEL"].includes(facture.statut) &&
                    facture.dateEcheance != null &&
                    new Date(facture.dateEcheance) < now);
                const colors = factureStatutIcon(facture.statut, isRetard);
                return (
                  <Link
                    key={facture.id}
                    href={`/factures/${facture.id}`}
                    className="flex items-center justify-between px-6 py-2.5 hover:bg-slate-50/80 transition-colors group"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                        <Receipt className={`w-3.5 h-3.5 ${colors.icon}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                          {isRetard && <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />}
                          {facture.numero}
                        </p>
                        <p className="text-xs text-slate-400">{facture.client.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 ml-4 shrink-0">
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {formatEuros(facture.totalTtc)}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FACTURE_STATUT_COLORS[facture.statut]}`}>
                        {FACTURE_STATUT_LABELS[facture.statut]}
                      </span>
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
