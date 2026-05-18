"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_COLORS, DEVIS_STATUT_LABELS } from "@/types";
import type { DevisStatut } from "@prisma/client";
import {
  filterDevis,
  filtersToParams,
  paramsToFilters,
  DEVIS_SORT_ACCESSORS,
  DEVIS_SORT_KEYS,
  DEVIS_DEFAULT_SORT,
  type DevisFilters,
  type DevisSortKey,
} from "@/lib/devis-filters";
import {
  sortBy,
  paramsToSort,
  sortToParams,
  nextSortState,
  type SortState,
} from "@/lib/list-sort";
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

  const filters: DevisFilters = useMemo(
    () => paramsToFilters(searchParams),
    [searchParams]
  );
  const sort: SortState<DevisSortKey> | null = useMemo(
    () => paramsToSort(searchParams, DEVIS_SORT_KEYS),
    [searchParams]
  );

  function pushParams(nextFilters: DevisFilters, nextSort: SortState<DevisSortKey> | null) {
    const fp = filtersToParams(nextFilters);
    const sp = sortToParams(nextSort);
    sp.forEach((v, k) => fp.set(k, v));
    const qs = fp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function setFilters(next: DevisFilters) {
    pushParams(next, sort);
  }

  function handleSortClick(key: DevisSortKey) {
    pushParams(filters, nextSortState(sort, key));
  }

  const filtered = useMemo(() => filterDevis(devis, filters), [devis, filters]);
  const sorted = useMemo(
    () => sortBy(filtered, sort, DEVIS_SORT_ACCESSORS, DEVIS_DEFAULT_SORT),
    [filtered, sort]
  );
  const hasFilters = filtersToParams(filters).toString() !== "";

  return (
    <div className="space-y-4">
      <DevisFiltersBar
        filters={filters}
        onChange={setFilters}
        availableYears={availableYears}
        totalCount={devis.length}
        filteredCount={sorted.length}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <SortableTh label="Référence" sortKey="numero" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Client" sortKey="client" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Objet" sortKey="objet" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Année" sortKey="annee" sort={sort} onClick={handleSortClick} align="center" />
              <SortableTh label="Date" sortKey="dateEmission" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Total TTC" sortKey="totalTtc" sort={sort} onClick={handleSortClick} align="right" />
              <SortableTh label="Statut" sortKey="statut" sort={sort} onClick={handleSortClick} />
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
                  {hasFilters ? "Aucun devis correspondant aux filtres" : "Aucun devis"}
                </td>
              </tr>
            ) : (
              sorted.map((d) => (
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

function SortableTh({
  label,
  sortKey,
  sort,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: DevisSortKey;
  sort: SortState<DevisSortKey> | null;
  onClick: (key: DevisSortKey) => void;
  align?: "left" | "center" | "right";
}) {
  const isActive = sort?.key === sortKey;
  const dir = isActive ? sort.order : null;
  const alignCls = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  const thAlign = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

  return (
    <th className={`${thAlign} px-5 py-3.5 text-xs font-semibold uppercase tracking-wider`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1.5 ${alignCls} ${
          isActive ? "text-blue-700" : "text-slate-400 hover:text-slate-700"
        } transition-colors cursor-pointer`}
      >
        <span>{label}</span>
        {dir === "asc" && <ArrowUp className="w-3 h-3" />}
        {dir === "desc" && <ArrowDown className="w-3 h-3" />}
        {!dir && <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-60" />}
      </button>
    </th>
  );
}
