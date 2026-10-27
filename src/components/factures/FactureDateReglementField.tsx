"use client";

import { useState } from "react";

interface FactureDateReglementFieldProps {
  factureId: string;
  initialValue: Date | string | null;
}

function toInputValue(v: Date | string | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toISOString().slice(0, 10);
}

export function FactureDateReglementField({ factureId, initialValue }: FactureDateReglementFieldProps) {
  const [value, setValue] = useState(toInputValue(initialValue));

  async function handleSave(newValue: string) {
    if (newValue === toInputValue(initialValue)) return;
    await fetch(`/api/factures/${factureId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateReglement: newValue || null }),
    });
  }

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-rule">
      <label className="text-xs font-medium text-brand-ink-muted shrink-0">Date de règlement</label>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => handleSave(e.target.value)}
        className="px-2 py-1 text-sm border border-brand-rule rounded-md focus:outline-none focus:ring-1 focus:ring-brand-blue bg-brand-paper"
      />
    </div>
  );
}
