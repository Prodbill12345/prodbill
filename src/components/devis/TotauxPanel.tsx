"use client";

import { formatEuros, formatPct } from "@/lib/calculations";
import type { CalculResult, TauxConfig } from "@/types";

interface TotauxPanelProps {
  result: CalculResult;
  taux: TauxConfig;
}

interface Row {
  label: string;
  value: number;
  sub?: boolean;
  highlight?: boolean;
  separator?: boolean;
  negative?: boolean;
}

export function TotauxPanel({ result, taux }: TotauxPanelProps) {
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
    { label: "TVA 20%", value: result.tva, sub: true },
    { label: "TOTAL TTC", value: result.totalTtc, highlight: true },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Récapitulatif</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          CS Artistes exclus de la base marge
        </p>
      </div>
      <div className="px-5 py-4 space-y-1.5">
        {rows.map((row, i) => (
          <div key={i}>
            {row.separator && i > 0 && (
              <div className="border-t border-slate-100 my-2" />
            )}
            <div
              className={`flex items-center justify-between py-1 ${
                row.highlight ? "font-semibold" : ""
              }`}
            >
              <span
                className={`text-sm ${
                  row.highlight
                    ? "text-slate-900"
                    : row.sub
                    ? "text-slate-500 pl-3"
                    : "text-slate-700"
                }`}
              >
                {row.label}
              </span>
              <span
                className={`text-sm tabular-nums ${
                  row.highlight
                    ? "text-slate-900"
                    : row.negative
                    ? "text-red-600"
                    : "text-slate-700"
                }`}
              >
                {row.value === 0 && row.sub ? (
                  <span className="text-slate-300">—</span>
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
