"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Receipt, X, Loader2 } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_LABELS } from "@/types";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { DEVIS_STATUT_TONE } from "@/design/status";
import { isDevisFacturable } from "@/lib/devis-facturable";
import {
  getFacturationState,
  type FactureForFacturation,
} from "@/lib/devis-facturation-state";
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
  // #99 : sélection multi pour facture récapitulative
  clientId: string;
  /**
   * Factures liées (mono + récap), préparées côté serveur. Alimente le même
   * prédicat que les routes — GUARD-DEVIS-DOUBLE-FACTURATION.
   */
  facturesLiees?: FactureForFacturation[];
}

/**
 * #99 : un devis est sélectionnable pour une facture récap s'il est facturable
 * (VALIDE/ENVOYE/ACCEPTE) et si sa place n'est pas déjà prise. Le serveur reste
 * l'autorité (client identique, taux TVA uniforme, etc.).
 *
 * Avant le garde-fou, ce test comptait `_count.factures + _count.factureLinks`
 * brut : il était donc PLUS strict que le serveur (il comptait les AVOIR et les
 * factures ANNULEE, et double-comptait les mono). On passe par
 * getFacturationState pour que l'UI et la route décident à l'identique, et pour
 * récupérer le motif exact du blocage.
 */
function recapSelectability(d: DevisRow): { selectable: boolean; reason: string | null } {
  if (!isDevisFacturable(d.statut)) {
    return {
      selectable: false,
      reason: "Ce devis doit être validé, envoyé ou accepté pour être facturé.",
    };
  }
  const state = getFacturationState(d.facturesLiees ?? []);
  return { selectable: state.canJoinRecap, reason: state.recapBlockedReason };
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

  // ── #99 : sélection multi-devis → facture récapitulative ──────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  const rowsById = useMemo(() => new Map(devis.map((d) => [d.id, d])), [devis]);
  // Client "verrouillé" par la 1ère sélection : on ne peut mélanger les clients.
  const lockedClientId = useMemo(() => {
    for (const id of selected) {
      const row = rowsById.get(id);
      if (row) return row.clientId;
    }
    return null;
  }, [selected, rowsById]);

  function toggleSelected(id: string) {
    setRecapError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setRecapError(null);
  }

  const selectedRows = useMemo(
    () => [...selected].map((id) => rowsById.get(id)).filter(Boolean) as DevisRow[],
    [selected, rowsById]
  );
  const selectedClientName = selectedRows[0]?.client.name ?? null;

  async function handleFacturerSelection() {
    if (selected.size < 2 || submitting) return;
    setSubmitting(true);
    setRecapError(null);
    try {
      const res = await fetch("/api/factures/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devisIds: [...selected] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecapError(json.error ?? "Erreur lors de la création de la facture.");
        setSubmitting(false);
        return;
      }
      router.push(`/factures/${json.data.id}`);
    } catch {
      setRecapError("Erreur réseau lors de la création de la facture.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <DevisFiltersBar
        filters={filters}
        onChange={setFilters}
        availableYears={availableYears}
        totalCount={devis.length}
        filteredCount={sorted.length}
      />

      {/* #99 : barre d'action facture récapitulative (apparaît dès 1 sélection) */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 px-5 py-3 rounded-[var(--radius-card)] border border-status-info-bg bg-status-info-bg/70">
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold text-brand-ink">
              {selected.size} devis sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            {selectedClientName && (
              <span className="text-brand-ink-muted"> · {selectedClientName}</span>
            )}
            {recapError ? (
              <span className="block text-brand-coral-ink mt-0.5">{recapError}</span>
            ) : (
              selected.size < 2 && (
                <span className="block text-brand-ink-muted mt-0.5">
                  Sélectionnez au moins 2 devis du même client.
                </span>
              )
            )}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1 text-sm text-brand-ink-muted hover:text-brand-ink"
          >
            <X className="w-4 h-4" />
            Annuler
          </button>
          <button
            type="button"
            onClick={handleFacturerSelection}
            disabled={selected.size < 2 || submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
            Facturer la sélection ({selected.size})
          </button>
        </div>
      )}

      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-rule bg-brand-surface/60">
              <th className="w-10 px-4 py-3.5"></th>
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
          <tbody className="divide-y divide-brand-rule">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-sm text-brand-ink-muted">
                  {hasFilters ? "Aucun devis correspondant aux filtres" : "Aucun devis"}
                </td>
              </tr>
            ) : (
              sorted.map((d) => {
                const { selectable, reason: notSelectableReason } =
                  recapSelectability(d);
                const isChecked = selected.has(d.id);
                // Verrou client : si une sélection existe pour un autre client,
                // on désactive les cases des autres clients.
                const clientLocked =
                  lockedClientId !== null && d.clientId !== lockedClientId;
                const checkboxDisabled = !selectable || (clientLocked && !isChecked);
                return (
                <tr
                  key={d.id}
                  className={`hover:bg-brand-surface/60 transition-colors group ${isChecked ? "bg-status-info-bg/50" : ""}`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={checkboxDisabled}
                      onChange={() => toggleSelected(d.id)}
                      title={
                        !selectable
                          ? (notSelectableReason ?? "Devis non facturable ou déjà facturé")
                          : clientLocked && !isChecked
                            ? "Un autre client est déjà sélectionné"
                            : "Sélectionner pour une facture récapitulative"
                      }
                      className="w-4 h-4 rounded border-brand-rule text-brand-blue focus:ring-brand-blue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/devis/${d.id}`}
                      className="font-semibold text-brand-ink group-hover:text-brand-blue transition-colors"
                    >
                      {d.numero ?? <span className="text-brand-ink-muted font-normal italic">Brouillon</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-brand-ink-muted">{d.client.name}</td>
                  <td className="px-4 py-3.5 text-sm text-brand-ink-muted max-w-[14rem] xl:max-w-xs truncate">{d.objet}</td>
                  <td className="px-4 py-3.5 text-sm text-brand-ink-muted text-center tabular-nums">
                    {d.annee ?? (d.dateEmission?.getUTCFullYear() ?? <span className="text-brand-ink-subtle">—</span>)}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-brand-ink-muted">{formatDate(d.dateEmission ?? d.updatedAt)}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-brand-ink text-right tabular-nums">
                    {formatEuros(d.totalTtc)}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge tone={DEVIS_STATUT_TONE[d.statut]} label={DEVIS_STATUT_LABELS[d.statut]} />
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
    <th className={`${thAlign} px-4 py-3 text-[10px] font-medium uppercase tracking-[0.15em]`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1.5 uppercase tracking-[0.15em] ${alignCls} ${
          isActive ? "text-brand-blue" : "text-brand-ink-muted hover:text-brand-ink"
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
