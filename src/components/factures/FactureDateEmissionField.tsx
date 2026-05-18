"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { FactureStatut } from "@prisma/client";

interface FactureDateEmissionFieldProps {
  factureId: string;
  initialValue: Date | string | null;
  statut: FactureStatut;
}

function toInputValue(v: Date | string | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toISOString().slice(0, 10);
}

const POST_EMISSION_STATUTS: FactureStatut[] = [
  "EMISE",
  "PAYEE_PARTIEL",
  "PAYEE",
  "EN_RETARD",
  "ANNULEE",
];

/**
 * Permet la modification de la date d'émission depuis la fiche facture.
 *
 * Affiche un warning visuel si la facture est post-émission
 * (statut ≠ BROUILLON), car modifier `dateEmission` après émission
 * peut violer l'immutabilité légale (art. 289 CGI). On laisse passer
 * pour permettre la correction de coquilles, mais l'API trace via
 * AuditLog `FACTURE_DATE_EMISSION_MODIFIED`.
 */
export function FactureDateEmissionField({
  factureId,
  initialValue,
  statut,
}: FactureDateEmissionFieldProps) {
  const [value, setValue] = useState(toInputValue(initialValue));
  const isPostEmission = POST_EMISSION_STATUTS.includes(statut);

  async function handleSave(newValue: string) {
    if (newValue === toInputValue(initialValue)) return;
    await fetch(`/api/factures/${factureId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateEmission: newValue || null }),
    });
  }

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-400 shrink-0">
          Date d&apos;émission
        </label>
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => handleSave(e.target.value)}
          className="px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
      </div>
      {isPostEmission && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" />
          <span>
            Cette facture est <strong>{statut.toLowerCase().replace("_", " ")}</strong>.
            Modifier la date d&apos;émission peut violer l&apos;immutabilité légale
            (art. 289 CGI). L&apos;action est tracée dans AuditLog.
          </span>
        </div>
      )}
    </div>
  );
}
