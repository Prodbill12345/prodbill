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
      color: "text-green-600 bg-green-50 border-green-100",
      btnColor: "bg-green-600 hover:bg-green-700",
      label: "Export Excel (.xlsx)",
      description:
        "4 onglets : Factures · Paiements · CA mensuel · Devis",
      href: `/api/export/excel?${params}`,
      filename: `export-${debut}_${fin}.xlsx`,
    },
    {
      id: "csv",
      icon: FileText,
      color: "text-blue-600 bg-blue-50 border-blue-100",
      btnColor: "bg-blue-600 hover:bg-blue-700",
      label: "Export CSV",
      description:
        "Toutes les factures, une ligne par facture, compatible Excel",
      href: `/api/export/csv?${params}`,
      filename: `factures-${debut}_${fin}.csv`,
    },
    {
      id: "fec",
      icon: BookOpen,
      color: "text-purple-600 bg-purple-50 border-purple-100",
      btnColor: "bg-purple-600 hover:bg-purple-700",
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
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Période d&apos;export</h2>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERIODES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriode(p.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                periode === p.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periode === "personnalise" && (
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Du
              </label>
              <input
                type="date"
                value={customDebut}
                onChange={(e) => setCustomDebut(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Au
              </label>
              <input
                type="date"
                value={customFin}
                onChange={(e) => setCustomFin(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 pt-1">
          Période sélectionnée :{" "}
          <span className="font-medium text-slate-600">{rangeStr}</span>
        </p>
      </div>

      {/* Boutons d'export */}
      <div className="space-y-3">
        {exports.map((exp) => {
          const Icon = exp.icon;
          return (
            <div
              key={exp.id}
              className={`bg-white rounded-xl border p-5 flex items-center gap-4 ${exp.color.split(" ").slice(2).join(" ")}`}
            >
              <div className={`p-3 rounded-xl ${exp.color.split(" ").slice(0, 2).join(" ")} shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{exp.label}</p>
                  {exp.badge && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      {exp.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{exp.description}</p>
              </div>

              <a
                href={exp.href}
                download={exp.filename}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors shrink-0 ${exp.btnColor}`}
              >
                <Download className="w-4 h-4" />
                Exporter
              </a>
            </div>
          );
        })}
      </div>

      {/* Note FEC */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">À propos du FEC</p>
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
