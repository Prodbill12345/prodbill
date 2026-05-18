"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_COLORS, DEVIS_STATUT_LABELS } from "@/types";
import type { DevisStatut } from "@prisma/client";
import {
  filterDevis,
  filtersToParams,
  paramsToFilters,
  type DevisFilters,
} from "@/lib/devis-filters";
import { DevisFiltersBar } from "./DevisFilters";

interface DevisRow {
  id: string;
  numero: string | null;
  objet: string;
  annee: number | null;
  statut: DevisStatut;
  totalTtc: number;
  updatedAt: Date;
  dateEmission: Date | null;
  client: { name: string };
  bdc?: { numero: string } | null;
}

interface DevisListClientProps {
  devis: DevisRow[];
  availableYears: number[];
}

export function DevisListClient({ devis, availableYears }: DevisListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Filtres dérivés de l'URL (source de vérité)
  const filters: DevisFilters = useMemo(
    () => paramsToFilters(searchParams),
    [searchParams]
  );

  function setFilters(next: DevisFilters) {
    const params = filtersToParams(next);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    // replace pour ne pas polluer l'historique navigateur à chaque
    // frappe ; scroll: false pour ne pas remonter en haut de page.
    startTransition(() => {
      router.replace(url, { scroll: false });
    });
  }

  const filtered = useMemo(() => filterDevis(devis, filters), [devis, filters]);
  const hasFilters = Object.keys(filtersToParams(filters).toString() ? filters : {}).length > 0;

  return (
    <div className="space-y-4">
      <DevisFiltersBar
        filters={filters}
        onChange={setFilters}
        availableYears={availableYears}
        totalCount={devis.length}
        filteredCount={filtered.length}
      />

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
                    {d.annee ?? (d.dateEmission?.getUTCFullYear() ?? <span className="text-slate-300">—</span>)}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">{formatDate(d.dateEmission ?? d.updatedAt)}</td>
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
