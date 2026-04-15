"use client";

import { useState } from "react";

interface FactureBdcFieldProps {
  factureId: string;
  initialValue: string | null;
  isLocked: boolean;
}

export function FactureBdcField({ factureId, initialValue, isLocked }: FactureBdcFieldProps) {
  const [value, setValue] = useState(initialValue ?? "");

  async function handleSave(newValue: string) {
    if (newValue === (initialValue ?? "")) return;
    await fetch(`/api/factures/${factureId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeroBdc: newValue.trim() || null }),
    });
  }

  if (isLocked) {
    if (!initialValue) return null;
    return (
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
        <span className="text-xs font-medium text-slate-400 shrink-0">N° BDC</span>
        <span className="text-sm text-slate-700 font-mono">{initialValue}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
      <label className="text-xs font-medium text-slate-400 shrink-0">N° BDC</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => handleSave(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Ex : BDC-2025-042"
        className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
    </div>
  );
}
