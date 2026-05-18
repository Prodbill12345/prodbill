"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { DEVIS_STATUT_LABELS } from "@/types";
import type { DevisStatut } from "@prisma/client";
import type { DevisFilters } from "@/lib/devis-filters";
import { hasActiveFilters } from "@/lib/devis-filters";
import { formatEuros } from "@/lib/calculations";

interface Props {
  filters: DevisFilters;
  onChange: (next: DevisFilters) => void;
  availableYears: number[];
  totalCount: number;
  filteredCount: number;
}

export function DevisFiltersBar({
  filters,
  onChange,
  availableYears,
  totalCount,
  filteredCount,
}: Props) {
  const [open, setOpen] = useState(false);

  function set<K extends keyof DevisFilters>(key: K, value: DevisFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function clearOne(key: keyof DevisFilters) {
    const next = { ...filters };
    delete next[key];
    onChange(next);
  }

  function clearAll() {
    onChange({});
    setOpen(false);
  }

  const advancedCount = [
    filters.dateEmissionFrom,
    filters.dateEmissionTo,
    filters.totalTtcMin !== undefined ? "ttcMin" : null,
    filters.totalTtcMax !== undefined ? "ttcMax" : null,
    filters.bdcNumero,
  ].filter(Boolean).length;

  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-2">
      {/* Barre principale */}
      <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex gap-3 items-center flex-wrap shadow-sm">
        {/* Recherche libre */}
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher numéro, client, objet…"
            value={filters.q ?? ""}
            onChange={(e) => set("q", e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Statut */}
        <select
          value={filters.statut ?? ""}
          onChange={(e) => set("statut", (e.target.value || undefined) as DevisStatut | undefined)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les statuts</option>
          {(Object.entries(DEVIS_STATUT_LABELS) as [DevisStatut, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Année */}
        <select
          value={filters.annee !== undefined ? String(filters.annee) : ""}
          onChange={(e) =>
            set("annee", e.target.value ? parseInt(e.target.value, 10) : undefined)
          }
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes les années</option>
          {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Toggle filtres avancés */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
            open || advancedCount > 0
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtres
          {advancedCount > 0 && (
            <span className="text-xs bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
              {advancedCount}
            </span>
          )}
        </button>

        <span className="text-xs text-slate-400 ml-auto tabular-nums">
          {filteredCount} / {totalCount} résultat{filteredCount > 1 ? "s" : ""}
        </span>

        {active && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Pills filtres actifs */}
      {active && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {filters.statut && (
            <Pill label={`Statut: ${DEVIS_STATUT_LABELS[filters.statut]}`} onClear={() => clearOne("statut")} />
          )}
          {filters.annee !== undefined && (
            <Pill label={`Année: ${filters.annee}`} onClear={() => clearOne("annee")} />
          )}
          {filters.dateEmissionFrom && (
            <Pill label={`Émis ≥ ${filters.dateEmissionFrom}`} onClear={() => clearOne("dateEmissionFrom")} />
          )}
          {filters.dateEmissionTo && (
            <Pill label={`Émis ≤ ${filters.dateEmissionTo}`} onClear={() => clearOne("dateEmissionTo")} />
          )}
          {filters.totalTtcMin !== undefined && (
            <Pill label={`TTC ≥ ${formatEuros(filters.totalTtcMin)}`} onClear={() => clearOne("totalTtcMin")} />
          )}
          {filters.totalTtcMax !== undefined && (
            <Pill label={`TTC ≤ ${formatEuros(filters.totalTtcMax)}`} onClear={() => clearOne("totalTtcMax")} />
          )}
          {filters.bdcNumero && (
            <Pill label={`BDC: ${filters.bdcNumero}`} onClear={() => clearOne("bdcNumero")} />
          )}
        </div>
      )}

      {/* Panneau avancé */}
      {open && (
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-700">Filtres avancés</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded"
              aria-label="Fermer le panneau de filtres avancés"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date émission range */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-500">Date d&apos;émission — de</label>
              <input
                type="date"
                value={filters.dateEmissionFrom ?? ""}
                onChange={(e) => set("dateEmissionFrom", e.target.value || undefined)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-500">Date d&apos;émission — à</label>
              <input
                type="date"
                value={filters.dateEmissionTo ?? ""}
                onChange={(e) => set("dateEmissionTo", e.target.value || undefined)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* TTC range */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-500">Total TTC — min (€)</label>
              <input
                type="number"
                inputMode="numeric"
                step="100"
                placeholder="0"
                value={filters.totalTtcMin ?? ""}
                onChange={(e) => set("totalTtcMin", e.target.value === "" ? undefined : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-500">Total TTC — max (€)</label>
              <input
                type="number"
                inputMode="numeric"
                step="100"
                placeholder="∞"
                value={filters.totalTtcMax ?? ""}
                onChange={(e) => set("totalTtcMax", e.target.value === "" ? undefined : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* N° BDC */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-xs font-medium text-slate-500">N° BDC</label>
              <input
                type="text"
                placeholder="BDC-26-…"
                value={filters.bdcNumero ?? ""}
                onChange={(e) => set("bdcNumero", e.target.value || undefined)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="hover:bg-blue-100 rounded-full p-0.5"
        aria-label={`Retirer le filtre ${label}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}
