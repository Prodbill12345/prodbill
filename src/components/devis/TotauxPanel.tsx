"use client";

import { formatEuros, formatPct } from "@/lib/calculations";
import { formatTvaLabel } from "@/lib/tva-label";
import type { CalculResult, TauxConfig } from "@/types";

interface TotauxPanelProps {
  result: CalculResult;
  taux: TauxConfig;
  /** Taux TVA en POURCENTAGE (20, 10, 5.5, 0). Pilote le libellé de la ligne TVA. */
  tauxTva: number;
}

interface Row {
  label: string;
  value: number;
  sub?: boolean;
  highlight?: boolean;
  separator?: boolean;
  negative?: boolean;
}

export function TotauxPanel({ result, taux, tauxTva }: TotauxPanelProps) {
  const rows: Row[] = [
    { label: "Sous-total HT", value: result.sousTotal, separator: true },
    {
      label: `CS Artistes (${formatPct(taux.tauxCsComedien)})`,
      value: result.csComedien,
      sub: true,
    },
    {
      label: `CS Technicien.ne.s HCS (${formatPct(taux.tauxCsTech)})`,
      value: result.csTechniciens,
      sub: true,
    },
    {
      label: "Base marge",
      value: result.baseMarge,
      sub: true,
      highlight: true,
    },
    {
      label: `Frais généraux (${formatPct(taux.tauxFg)})`,
      value: result.fraisGeneraux,
      sub: true,
    },
    {
      label: `Marge (${formatPct(taux.tauxMarge)})`,
      value: result.marge,
      sub: true,
    },
    { label: "TOTAL HT", value: result.totalHt, separator: true, highlight: true },
    ...(result.remise > 0 ? [
      { label: "Remise exceptionnelle", value: result.remise, sub: true, negative: true },
      { label: "Total après remise", value: result.totalApresRemise, sub: true, highlight: true },
    ] : []),
    { label: formatTvaLabel(tauxTva), value: result.tva, sub: true },
    { label: "TOTAL TTC", value: result.totalTtc, highlight: true },
  ];

  return (
    <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-hidden">
      <div className="px-5 py-4 border-b border-brand-rule">
        <h3 className="font-semibold text-brand-ink">Récapitulatif</h3>
        <p className="text-xs text-brand-ink-muted mt-0.5">
          CS Artistes exclus de la base marge
        </p>
      </div>
      <div className="px-5 py-4 space-y-1.5">
        {rows.map((row, i) => (
          <div key={i}>
            {row.separator && i > 0 && (
              <div className="border-t border-brand-rule my-2" />
            )}
            <div
              className={`flex items-center justify-between py-1 ${
                row.highlight ? "font-semibold" : ""
              }`}
            >
              <span
                className={`text-sm ${
                  row.highlight
                    ? "text-brand-ink"
                    : row.sub
                    ? "text-brand-ink-muted pl-3"
                    : "text-brand-ink"
                }`}
              >
                {row.label}
              </span>
              <span
                className={`text-sm tabular-nums ${
                  row.highlight
                    ? "text-brand-ink"
                    : row.negative
                    ? "text-brand-coral-ink"
                    : "text-brand-ink"
                }`}
              >
                {row.value === 0 && row.sub ? (
                  <span className="text-brand-ink-subtle">—</span>
                ) : row.negative ? (
                  `-${formatEuros(row.value)}`
                ) : (
                  formatEuros(row.value)
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
