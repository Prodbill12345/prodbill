"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertCircle } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { FACTURE_STATUT_COLORS, FACTURE_STATUT_LABELS, FACTURE_TYPE_LABELS } from "@/types";
import type { FactureStatut, FactureType } from "@prisma/client";

interface FactureRow {
  id: string;
  numero: string;
  numeroBdc: string | null;
  type: FactureType;
  statut: FactureStatut;
  dateEmission: Date | null;
  dateEcheance: Date | null;
  dateReglement: Date | null;
  totalTtc: number;
  client: { name: string };
  paiements: { montant: number }[];
}

const ANNEES = [2023, 2024, 2025, 2026, 2027];

function getAnnee(f: FactureRow): number | null {
  return f.dateEmission ? new Date(f.dateEmission).getFullYear() : null;
}

export function FacturesListClient({ factures }: { factures: FactureRow[] }) {
  const [filterAnnee, setFilterAnnee] = useState("");
  const [filterNumero, setFilterNumero] = useState("");
  const [filterBdc, setFilterBdc] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterStatut, setFilterStatut] = useState("");

  const filtered = factures.filter((f) => {
    if (filterAnnee && String(getAnnee(f) ?? "") !== filterAnnee) return false;
    if (filterNumero && !f.numero.toLowerCase().includes(filterNumero.toLowerCase())) return false;
    if (filterBdc && !(f.numeroBdc ?? "").toLowerCase().includes(filterBdc.toLowerCase())) return false;
    if (filterClient && !f.client.name.toLowerCase().includes(filterClient.toLowerCase())) return false;
    if (filterStatut && f.statut !== filterStatut) return false;
    return true;
  });

  const hasFilters = filterAnnee || filterNumero || filterBdc || filterClient || filterStatut;

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex gap-3 items-center flex-wrap shadow-sm">
        <select
          value={filterAnnee}
          onChange={(e) => setFilterAnnee(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Toutes les années</option>
          {ANNEES.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <input
          type="text"
          placeholder="N° facture…"
          value={filterNumero}
          onChange={(e) => setFilterNumero(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
        />

        <input
          type="text"
          placeholder="N° BDC…"
          value={filterBdc}
          onChange={(e) => setFilterBdc(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
        />

        <input
          type="text"
          placeholder="Client…"
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-48"
        />

        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Tous les statuts</option>
          {(Object.entries(FACTURE_STATUT_LABELS) as [FactureStatut, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setFilterAnnee(""); setFilterNumero(""); setFilterBdc(""); setFilterClient(""); setFilterStatut(""); }}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Réinitialiser
          </button>
        )}

        <span className="text-xs text-slate-400 ml-auto">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Numéro</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Année</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">BDC</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Émise le</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Échéance</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date règlement</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total TTC</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Statut</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">
                  {hasFilters ? "Aucune facture correspondant aux filtres" : "Aucune facture"}
                </td>
              </tr>
            ) : (
              filtered.map((f) => {
                const totalPaye = f.paiements.reduce((s, p) => s + p.montant, 0);
                const isRetard =
                  f.statut === "EN_RETARD" ||
                  (f.statut === "EMISE" && f.dateEcheance && new Date(f.dateEcheance) < new Date());
                const annee = getAnnee(f);

                return (
                  <tr
                    key={f.id}
                    className={`transition-colors group ${isRetard ? "hover:bg-red-50/40 bg-red-50/20" : "hover:bg-emerald-50/20"}`}
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/factures/${f.id}`}
                        className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5"
                      >
                        {isRetard && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        {f.numero}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{f.client.name}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{FACTURE_TYPE_LABELS[f.type]}</td>
                    <td className="px-5 py-4 text-sm text-slate-400 text-center tabular-nums">
                      {annee ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400 font-mono text-xs">
                      {f.numeroBdc ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">{formatDate(f.dateEmission)}</td>
                    <td className={`px-5 py-4 text-sm font-medium ${isRetard ? "text-red-600" : "text-slate-400 font-normal"}`}>
                      {formatDate(f.dateEcheance)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">
                      {f.dateReglement ? formatDate(f.dateReglement) : <span className="text-slate-200">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatEuros(f.totalTtc)}</p>
                      {totalPaye > 0 && totalPaye < f.totalTtc && (
                        <p className="text-xs text-slate-400 tabular-nums">Payé : {formatEuros(totalPaye)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${FACTURE_STATUT_COLORS[f.statut]}`}>
                        {FACTURE_STATUT_LABELS[f.statut]}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
