"use client";

import { useState, useMemo } from "react";
import { FileSpreadsheet, FileText, BookOpen, Download, Calendar } from "lucide-react";

type Periode = "mois" | "trimestre" | "annee" | "personnalise";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function computeRange(periode: Periode, customDebut: string, customFin: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (periode) {
    case "mois":
      return {
        debut: isoDate(new Date(y, m, 1)),
        fin: isoDate(new Date(y, m + 1, 0)),
      };
    case "trimestre": {
      const q = Math.floor(m / 3);
      return {
        debut: isoDate(new Date(y, q * 3, 1)),
        fin: isoDate(new Date(y, q * 3 + 3, 0)),
      };
    }
    case "annee":
      return {
        debut: isoDate(new Date(y, 0, 1)),
        fin: isoDate(new Date(y, 11, 31)),
      };
    case "personnalise":
    default:
      return { debut: customDebut, fin: customFin };
  }
}

const PERIODES: { value: Periode; label: string }[] = [
  { value: "mois",         label: "Mois en cours" },
  { value: "trimestre",    label: "Trimestre en cours" },
  { value: "annee",        label: "Année en cours" },
  { value: "personnalise", label: "Période personnalisée" },
];

export function ExportClient() {
  const now = new Date();
  const [periode, setPeriode] = useState<Periode>("mois");
  const [customDebut, setCustomDebut] = useState(
    isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [customFin, setCustomFin] = useState(isoDate(now));

  const { debut, fin } = useMemo(
    () => computeRange(periode, customDebut, customFin),
    [periode, customDebut, customFin]
  );

  const params = `debut=${debut}&fin=${fin}`;

  const periodLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const rangeStr = `${periodLabel.format(new Date(debut))} → ${periodLabel.format(new Date(fin))}`;

  const exports = [
    {
      id: "excel",
      icon: FileSpreadsheet,
      color: "text-brand-pistachio-ink bg-status-success-bg border-status-success-bg",
      btnColor: "bg-brand-blue hover:bg-brand-ink",
      label: "Export Excel (.xlsx)",
      description:
        "4 onglets : Factures · Paiements · CA mensuel · Devis",
      href: `/api/export/excel?${params}`,
      filename: `export-${debut}_${fin}.xlsx`,
    },
    {
      id: "csv",
      icon: FileText,
      color: "text-brand-blue bg-status-info-bg border-status-info-bg",
      btnColor: "bg-brand-blue hover:bg-brand-ink",
      label: "Export CSV",
      description:
        "Toutes les factures, une ligne par facture, compatible Excel",
      href: `/api/export/csv?${params}`,
      filename: `factures-${debut}_${fin}.csv`,
    },
    {
      id: "fec",
      icon: BookOpen,
      color: "text-brand-blue bg-status-info-bg border-status-info-bg",
      btnColor: "bg-brand-blue hover:bg-brand-ink",
      label: "Export FEC",
      description:
        "Fichier des Écritures Comptables — format légal (arrêté 29/07/2013) pour expert-comptable",
      href: `/api/export/fec?${params}`,
      filename: `FEC-${debut}_${fin}.txt`,
      badge: "Légal",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sélecteur de période */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-brand-ink-muted" />
          <h2 className="font-semibold text-brand-ink">Période d&apos;export</h2>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERIODES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriode(p.value)}
              className={`px-3 py-2 rounded-[var(--radius-control)] text-sm font-medium border transition-colors ${
                periode === p.value
                  ? "bg-brand-blue text-brand-cream border-brand-blue"
                  : "bg-brand-paper text-brand-ink-muted border-brand-rule hover:bg-brand-surface"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periode === "personnalise" && (
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1">
              <label className="block text-xs font-medium text-brand-ink-muted mb-1">
                Du
              </label>
              <input
                type="date"
                value={customDebut}
                onChange={(e) => setCustomDebut(e.target.value)}
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-brand-ink-muted mb-1">
                Au
              </label>
              <input
                type="date"
                value={customFin}
                onChange={(e) => setCustomFin(e.target.value)}
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>
        )}

        <p className="text-xs text-brand-ink-muted pt-1">
          Période sélectionnée :{" "}
          <span className="font-medium text-brand-ink-muted">{rangeStr}</span>
        </p>
      </div>

      {/* Boutons d'export */}
      <div className="space-y-3">
        {exports.map((exp) => {
          const Icon = exp.icon;
          return (
            <div
              key={exp.id}
              className={`bg-brand-paper rounded-[var(--radius-card)] border p-5 flex items-center gap-4 ${exp.color.split(" ").slice(2).join(" ")}`}
            >
              <div className={`p-3 rounded-[var(--radius-card)] ${exp.color.split(" ").slice(0, 2).join(" ")} shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-brand-ink">{exp.label}</p>
                  {exp.badge && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-status-info-bg text-brand-blue">
                      {exp.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-brand-ink-muted mt-0.5">{exp.description}</p>
              </div>

              <a
                href={exp.href}
                download={exp.filename}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-medium text-brand-cream transition-colors shrink-0 ${exp.btnColor}`}
              >
                <Download className="w-4 h-4" />
                Exporter
              </a>
            </div>
          );
        })}
      </div>

      {/* Note FEC */}
      <div className="bg-brand-surface border border-brand-rule rounded-[var(--radius-card)] p-4 text-xs text-brand-ink-muted space-y-1">
        <p className="font-semibold text-brand-ink">À propos du FEC</p>
        <p>
          Le Fichier des Écritures Comptables est requis en cas de contrôle fiscal (art. L47 A LPF).
          Il contient les journaux de ventes (compte 411, 706, 445710) et de banque (compte 512).
        </p>
        <p>
          Format : pipe-délimité UTF-8, conforme à l&apos;arrêté du 29 juillet 2013.
        </p>
      </div>
    </div>
  );
}
