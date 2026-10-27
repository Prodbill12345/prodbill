"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatFactureNumero } from "@/lib/facture-numero";

const MODES = [
  { value: "virement", label: "Virement bancaire" },
  { value: "cheque", label: "Chèque" },
  { value: "carte", label: "Carte bancaire" },
  { value: "especes", label: "Espèces" },
  { value: "autre", label: "Autre" },
];

export interface FacturePaiementInfo {
  id: string;
  numero: string | null;
  totalTtc: number;
  resteAPayer: number;
}

interface Props {
  facture: FacturePaiementInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaiementModal({ facture, onClose, onSuccess }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [montant, setMontant] = useState(
    facture.resteAPayer.toFixed(2)
  );
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState("virement");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const montantNum = parseFloat(montant);
    if (isNaN(montantNum) || montantNum <= 0) {
      setError("Montant invalide");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/paiements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factureId: facture.id,
          montant: montantNum,
          date,
          mode,
          reference: reference || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Erreur lors de l'enregistrement");
        return;
      }

      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 bg-brand-ink/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-brand-paper rounded-[var(--radius-card)] w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-rule">
          <div>
            <h2 className="font-semibold text-brand-ink">
              Enregistrer un paiement
            </h2>
            <p className="text-xs text-brand-ink-muted mt-0.5">
              Facture {formatFactureNumero(facture)} — Reste dû :{" "}
              <span className="font-medium text-brand-ink">
                {formatEuros(facture.resteAPayer)}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-brand-ink-muted hover:text-brand-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Montant reçu (TTC) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={facture.resteAPayer + 0.01}
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                required
                className="w-full pl-3 pr-10 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                placeholder="0,00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-ink-muted text-sm">
                €
              </span>
            </div>
            {parseFloat(montant) >= facture.resteAPayer && (
              <p className="text-xs text-brand-pistachio-ink mt-1 font-medium">
                ✓ Soldera intégralement la facture
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Date de réception *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              max={today}
              className="w-full px-3 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Mode de paiement *
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-3 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-brand-paper"
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Référence */}
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Référence bancaire
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              placeholder="REF-12345 (optionnel)"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
              placeholder="Informations complémentaires (optionnel)"
            />
          </div>

          {error && (
            <p className="text-sm text-brand-coral-ink bg-status-danger-bg border border-status-danger-bg rounded-[var(--radius-control)] px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-brand-surface transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
