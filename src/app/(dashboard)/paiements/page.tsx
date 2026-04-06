import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { PaiementsClient, type FactureRow } from "@/components/paiements/PaiementsClient";
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
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [facturesRaw, paiementsRecents] = await Promise.all([
    prisma.facture.findMany({
      where: {
        companyId: user.companyId,
        statut: { not: "BROUILLON" },
        type: { not: "AVOIR" },
      },
      include: {
        client: { select: { name: true } },
        paiements: true,
      },
      orderBy: [{ dateEcheance: "asc" }, { createdAt: "desc" }],
    }),
    prisma.paiement.findMany({
      where: { facture: { companyId: user.companyId } },
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
        <h1 className="text-2xl font-bold text-slate-900">Paiements</h1>
        <p className="text-slate-500 mt-1">Suivi des encaissements</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-sm text-slate-500">Encaissé ce mois</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatEuros(encaisseMonth)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <p className="text-sm text-slate-500">En attente</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatEuros(totalEnAttente)}
          </p>
        </div>

        <div
          className={`rounded-xl border p-5 shadow-sm ${
            enRetard.length > 0
              ? "bg-red-50 border-red-100"
              : "bg-white border-slate-100"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle
              className={`w-4 h-4 ${enRetard.length > 0 ? "text-red-600" : "text-slate-400"}`}
            />
            <p
              className={`text-sm ${enRetard.length > 0 ? "text-red-600" : "text-slate-500"}`}
            >
              En retard ({enRetard.length})
            </p>
          </div>
          <p
            className={`text-2xl font-bold ${
              enRetard.length > 0 ? "text-red-700" : "text-slate-900"
            }`}
          >
            {formatEuros(totalEnRetard)}
          </p>
        </div>

        <div
          className={`rounded-xl border p-5 shadow-sm ${
            totalPenalites > 0
              ? "bg-orange-50 border-orange-100"
              : "bg-white border-slate-100"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle
              className={`w-4 h-4 ${totalPenalites > 0 ? "text-orange-500" : "text-slate-400"}`}
            />
            <p
              className={`text-sm ${totalPenalites > 0 ? "text-orange-600" : "text-slate-500"}`}
            >
              Pénalités dues (15%/an)
            </p>
          </div>
          <p
            className={`text-2xl font-bold ${
              totalPenalites > 0 ? "text-orange-700" : "text-slate-900"
            }`}
          >
            {formatEuros(totalPenalites)}
          </p>
          {totalPenalites > 0 && (
            <p className="text-xs text-orange-500 mt-1">+ indemnité 40 € / facture</p>
          )}
        </div>
      </div>

      {/* Alerte factures en retard */}
      {enRetard.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 text-sm text-red-800">
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
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Historique des paiements</h2>
          <span className="text-xs text-slate-400">{paiementsRecents.length} entrées récentes</span>
        </div>
        {paiementsRecents.length === 0 ? (
          <p className="px-5 py-10 text-center text-slate-400 text-sm">
            Aucun paiement enregistré
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Facture</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Client</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Mode</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Référence</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paiementsRecents.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 text-sm text-slate-500">
                    {formatDate(p.date)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/factures/${p.factureId}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      {p.facture.numero}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-700">
                    {p.facture.client.name}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-500 capitalize">
                    {p.mode ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-400 font-mono">
                    {p.reference ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-right tabular-nums text-green-700">
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
