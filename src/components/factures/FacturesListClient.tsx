"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { FACTURE_STATUT_LABELS, FACTURE_TYPE_LABELS } from "@/types";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { FACTURE_STATUT_TONE } from "@/design/status";
import { formatFactureNumero } from "@/lib/facture-numero";
import type { FactureStatut, FactureType } from "@prisma/client";
import {
  filterFactures,
  filtersToParams,
  paramsToFilters,
  FACTURE_SORT_ACCESSORS,
  FACTURE_SORT_KEYS,
  FACTURE_DEFAULT_SORT,
  type FacturesFilters,
  type FactureSortKey,
} from "@/lib/factures-filters";
import {
  sortBy,
  paramsToSort,
  sortToParams,
  nextSortState,
  type SortState,
} from "@/lib/list-sort";
import { FacturesFiltersBar } from "./FacturesFilters";

interface FactureRow {
  id: string;
  numero: string | null;
  numeroBdc: string | null;
  type: FactureType;
  statut: FactureStatut;
  dateEmission: Date | null;
  dateEcheance: Date | null;
  dateReglement: Date | null;
  totalTtc: number;
  client: { name: string };
  paiements: { montant: number }[];
  devis?: { numero: string | null; objet: string } | null;
}

interface FacturesListClientProps {
  factures: FactureRow[];
  availableYears: number[];
}

export function FacturesListClient({ factures, availableYears }: FacturesListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const filters: FacturesFilters = useMemo(
    () => paramsToFilters(searchParams),
    [searchParams]
  );
  const sort: SortState<FactureSortKey> | null = useMemo(
    () => paramsToSort(searchParams, FACTURE_SORT_KEYS),
    [searchParams]
  );

  function pushParams(nextFilters: FacturesFilters, nextSort: SortState<FactureSortKey> | null) {
    const fp = filtersToParams(nextFilters);
    const sp = sortToParams(nextSort);
    sp.forEach((v, k) => fp.set(k, v));
    const qs = fp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function setFilters(next: FacturesFilters) {
    pushParams(next, sort);
  }

  function handleSortClick(key: FactureSortKey) {
    pushParams(filters, nextSortState(sort, key));
  }

  const filtered = useMemo(() => filterFactures(factures, filters), [factures, filters]);
  const sorted = useMemo(
    () => sortBy(filtered, sort, FACTURE_SORT_ACCESSORS, FACTURE_DEFAULT_SORT),
    [filtered, sort]
  );
  const hasFilters = filtersToParams(filters).toString() !== "";

  return (
    <div className="space-y-4">
      <FacturesFiltersBar
        filters={filters}
        onChange={setFilters}
        availableYears={availableYears}
        totalCount={factures.length}
        filteredCount={sorted.length}
      />

      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-rule bg-brand-surface/60">
              <SortableTh label="Numéro" sortKey="numero" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Client" sortKey="client" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Type" sortKey="type" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Année" sortKey="annee" sort={sort} onClick={handleSortClick} align="center" />
              <SortableTh label="BDC" sortKey="numeroBdc" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Émise le" sortKey="dateEmission" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Échéance" sortKey="dateEcheance" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Date règlement" sortKey="dateReglement" sort={sort} onClick={handleSortClick} />
              <SortableTh label="Total TTC" sortKey="totalTtc" sort={sort} onClick={handleSortClick} align="right" />
              <SortableTh label="Statut" sortKey="statut" sort={sort} onClick={handleSortClick} />
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-rule">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-sm text-brand-ink-muted">
                  {hasFilters ? "Aucune facture correspondant aux filtres" : "Aucune facture"}
                </td>
              </tr>
            ) : (
              sorted.map((f) => {
                const totalPaye = f.paiements.reduce((s, p) => s + p.montant, 0);
                const isRetard =
                  f.statut === "EN_RETARD" ||
                  (f.statut === "EMISE" && f.dateEcheance && new Date(f.dateEcheance) < new Date());
                const annee = f.dateEmission ? f.dateEmission.getUTCFullYear() : null;

                return (
                  <tr
                    key={f.id}
                    className={`transition-colors group ${isRetard ? "hover:bg-status-danger-bg/50 bg-status-danger-bg/25" : "hover:bg-brand-surface/60"}`}
                  >
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/factures/${f.id}`}
                        className="font-semibold text-brand-ink group-hover:text-brand-blue transition-colors flex items-center gap-1.5"
                      >
                        {isRetard && <AlertCircle className="w-3.5 h-3.5 text-brand-coral shrink-0" />}
                        {formatFactureNumero(f)}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-brand-ink-muted">{f.client.name}</td>
                    <td className="px-4 py-3.5 text-sm text-brand-ink-muted">{FACTURE_TYPE_LABELS[f.type]}</td>
                    <td className="px-4 py-3.5 text-sm text-brand-ink-muted text-center tabular-nums">
                      {annee ?? <span className="text-brand-ink-subtle">—</span>}
                    </td>
                    <td
                      className="px-4 py-3.5 text-sm text-brand-ink-muted font-mono text-xs max-w-[9rem] truncate"
                      title={f.numeroBdc ?? undefined}
                    >
                      {f.numeroBdc ?? <span className="text-brand-ink-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-brand-ink-muted">{formatDate(f.dateEmission)}</td>
                    <td className={`px-4 py-3.5 text-sm font-medium ${isRetard ? "text-brand-coral-ink" : "text-brand-ink-muted font-normal"}`}>
                      {formatDate(f.dateEcheance)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-brand-ink-muted">
                      {f.dateReglement ? formatDate(f.dateReglement) : <span className="text-brand-ink-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm font-semibold text-brand-ink tabular-nums">{formatEuros(f.totalTtc)}</p>
                      {totalPaye > 0 && totalPaye < f.totalTtc && (
                        <p className="text-xs text-brand-ink-muted tabular-nums">Payé : {formatEuros(totalPaye)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge tone={FACTURE_STATUT_TONE[f.statut]} label={FACTURE_STATUT_LABELS[f.statut]} />
                    </td>
                    <td className="px-3 py-4">
                      <ChevronRight className="w-4 h-4 text-brand-ink-subtle group-hover:text-brand-ink-muted transition-colors" />
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

function SortableTh({
  label,
  sortKey,
  sort,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: FactureSortKey;
  sort: SortState<FactureSortKey> | null;
  onClick: (key: FactureSortKey) => void;
  align?: "left" | "center" | "right";
}) {
  const isActive = sort?.key === sortKey;
  const dir = isActive ? sort.order : null;
  const alignCls = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  const thAlign = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

  return (
    <th className={`${thAlign} px-4 py-3 text-[10px] font-medium uppercase tracking-[0.15em]`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1.5 uppercase tracking-[0.15em] ${alignCls} ${
          isActive ? "text-brand-ink" : "text-brand-ink-muted hover:text-brand-ink"
        } transition-colors cursor-pointer`}
      >
        <span>{label}</span>
        {dir === "asc" && <ArrowUp className="w-3 h-3" />}
        {dir === "desc" && <ArrowDown className="w-3 h-3" />}
        {!dir && <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </button>
    </th>
  );
}
