"use client";

import { formatEuros } from "@/lib/calculations";

export interface MonthData {
  label: string; // "Jan", "Fév", etc.
  ca: number;
}

const CHART_H = 220;
const BAR_W = 44;
const BAR_GAP = 12;

export function CaChart({ data }: { data: MonthData[] }) {
  const max = Math.max(...data.map((d) => d.ca), 1);
  const totalWidth = data.length * (BAR_W + BAR_GAP) - BAR_GAP;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${totalWidth} ${CHART_H + 40}`}
        className="w-full overflow-visible"
        aria-label="CA des 6 derniers mois"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = CHART_H - ratio * CHART_H;
          return (
            <line
              key={ratio}
              x1={0}
              y1={y}
              x2={totalWidth}
              y2={y}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
          );
        })}

        {data.map((d, i) => {
          const x = i * (BAR_W + BAR_GAP);
          const barH = Math.max(4, Math.round((d.ca / max) * CHART_H));
          const barY = CHART_H - barH;
          const isLast = i === data.length - 1;

          return (
            <g key={d.label}>
              {/* Barre fond (track) */}
              <rect
                x={x}
                y={0}
                width={BAR_W}
                height={CHART_H}
                rx={6}
                fill="#f8fafc"
              />

              {/* Barre valeur */}
              <rect
                x={x}
                y={barY}
                width={BAR_W}
                height={barH}
                rx={6}
                fill={isLast ? "url(#barGradientActive)" : "url(#barGradient)"}
              />

              {/* Montant au-dessus */}
              {d.ca > 0 && (
                <text
                  x={x + BAR_W / 2}
                  y={barY - 7}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={isLast ? "#3b82f6" : "#94a3b8"}
                  fontWeight={isLast ? "700" : "500"}
                >
                  {d.ca >= 1000
                    ? `${(d.ca / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k`
                    : d.ca.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                </text>
              )}

              {/* Label mois */}
              <text
                x={x + BAR_W / 2}
                y={CHART_H + 18}
                textAnchor="middle"
                fontSize={11}
                fill={isLast ? "#3b82f6" : "#94a3b8"}
                fontWeight={isLast ? "700" : "400"}
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Gradients */}
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#dbeafe" />
          </linearGradient>
          <linearGradient id="barGradientActive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>

      {/* Total période */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-400">Total 6 mois · TTC encaissé</span>
        <span className="text-sm font-bold text-slate-900">
          {formatEuros(data.reduce((s, d) => s + d.ca, 0))}
        </span>
      </div>
    </div>
  );
}
