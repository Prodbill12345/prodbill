"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_COLORS, DEVIS_STATUT_LABELS } from "@/types";
import type { DevisStatut } from "@prisma/client";

interface DevisRow {
  id: string;
  numero: string | null;
  objet: string;
  annee: number | null;
  statut: DevisStatut;
  totalTtc: number;
  updatedAt: Date;
  client: { name: string };
}

const ANNEES = [2023, 2024, 2025, 2026, 2027];

export function DevisListClient({ devis }: { devis: DevisRow[] }) {
  const [filterAnnee, setFilterAnnee] = useState("");
  const [filterNumero, setFilterNumero] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterStatut, setFilterStatut] = useState("");

  const filtered = devis.filter((d) => {
    if (filterAnnee && String(d.annee ?? "") !== filterAnnee) return false;
    if (filterNumero && !(d.numero ?? "").toLowerCase().includes(filterNumero.toLowerCase())) return false;
    if (filterClient && !d.client.name.toLowerCase().includes(filterClient.toLowerCase())) return false;
    if (filterStatut && d.statut !== filterStatut) return false;
    return true;
  });

  const hasFilters = filterAnnee || filterNumero || filterClient || filterStatut;

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex gap-3 items-center flex-wrap shadow-sm">
        <select
          value={filterAnnee}
          onChange={(e) => setFilterAnnee(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes les années</option>
          {ANNEES.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <input
          type="text"
          placeholder="N° devis…"
          value={filterNumero}
          onChange={(e) => setFilterNumero(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
        />

        <input
          type="text"
          placeholder="Client…"
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />

        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les statuts</option>
          {(Object.entries(DEVIS_STATUT_LABELS) as [DevisStatut, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setFilterAnnee(""); setFilterNumero(""); setFilterClient(""); setFilterStatut(""); }}
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
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Référence</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Objet</th>
              <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Année</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total TTC</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Statut</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
                  {hasFilters ? "Aucun devis correspondant aux filtres" : "Aucun devis"}
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-5 py-4">
                    <Link
                      href={`/devis/${d.id}`}
                      className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors"
                    >
                      {d.numero ?? <span className="text-slate-400 font-normal italic">Brouillon</span>}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{d.client.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 max-w-xs truncate">{d.objet}</td>
                  <td className="px-5 py-4 text-sm text-slate-400 text-center tabular-nums">
                    {d.annee ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">{formatDate(d.updatedAt)}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900 text-right tabular-nums">
                    {formatEuros(d.totalTtc)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${DEVIS_STATUT_COLORS[d.statut]}`}>
                      {DEVIS_STATUT_LABELS[d.statut]}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
