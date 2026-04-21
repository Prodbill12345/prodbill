"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Send, RotateCcw, Loader2, Bell, Pencil, X, Check } from "lucide-react";
import type { Facture } from "@/types";
import { PdfModal } from "@/components/shared/PdfModal";

const ANNEES = [2023, 2024, 2025, 2026, 2027];

interface FactureActionsProps {
  facture: Facture;
  hasRelances?: boolean; // pour libellé du bouton relancer
}

export function FactureActions({ facture, hasRelances = false }: FactureActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Formulaire de correction
  const [showEdit, setShowEdit] = useState(false);
  const initAnnee = facture.dateEmission
    ? String(new Date(facture.dateEmission).getFullYear())
    : "";
  const [editNumero, setEditNumero] = useState(facture.numero);
  const [editBdc, setEditBdc] = useState(facture.numeroBdc ?? "");
  const [editAnnee, setEditAnnee] = useState(initAnnee);
  const [saving, setSaving] = useState(false);

  async function saveCorrection() {
    setSaving(true);
    try {
      const dateEmission = editAnnee
        ? `${editAnnee}-${String(
            facture.dateEmission ? new Date(facture.dateEmission).getMonth() + 1 : 1
          ).padStart(2, "0")}-${String(
            facture.dateEmission ? new Date(facture.dateEmission).getDate() : 1
          ).padStart(2, "0")}`
        : null;

      const res = await fetch(`/api/factures/${facture.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: editNumero.trim() || facture.numero,
          numeroBdc: editBdc.trim() || null,
          dateEmission,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      setShowEdit(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function post(endpoint: string, key: string) {
    setLoading(key);
    try {
      const res = await fetch(`/api/factures/${facture.id}/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur");
        return;
      }
      return res.json();
    } finally {
      setLoading(null);
    }
  }

  async function emettre() {
    if (!confirm("Émettre cette facture ? Elle deviendra immuable et ne pourra plus être modifiée.")) return;
    const data = await post("emettre", "emettre");
    if (data) router.refresh();
  }

  async function envoyerEmail() {
    const data = await post("envoyer", "envoyer");
    if (data) {
      showToast(`Facture envoyée à ${data.sentTo}`);
      router.refresh();
    }
  }

  async function relancer() {
    const data = await post("relancer", "relancer");
    if (data) {
      const labels: Record<string, string> = {
        RELANCE_1: "1ère relance",
        RELANCE_2: "2ème relance",
        MISE_EN_DEMEURE: "Mise en demeure",
      };
      showToast(`${labels[data.type] ?? "Relance"} envoyée à ${data.sentTo}`);
      router.refresh();
    }
  }

  async function genererAvoir() {
    if (!confirm("Générer un avoir pour annuler cette facture ? Cette action est irréversible.")) return;
    const data = await post("avoir", "avoir");
    if (data) router.push(`/factures/${data.data.id}`);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const spin = (key: string) =>
    loading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : null;

  const canEmettre = facture.statut === "BROUILLON";
  const isEmise = !!facture.emiseAt;
  const canRelancer =
    isEmise &&
    facture.type !== "AVOIR" &&
    facture.statut !== "PAYEE" &&
    facture.statut !== "ANNULEE";
  const canAvoir =
    facture.type !== "AVOIR" &&
    (facture.statut === "EMISE" ||
      facture.statut === "PAYEE" ||
      facture.statut === "PAYEE_PARTIEL");

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Formulaire de correction inline */}
      {showEdit && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-80 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Corriger la facture</p>
          <div>
            <label className="block text-xs text-slate-500 mb-1">N° Caleson</label>
            <input
              type="text"
              value={editNumero}
              onChange={(e) => setEditNumero(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">N° BDC client</label>
            <input
              type="text"
              value={editBdc}
              onChange={(e) => setEditBdc(e.target.value)}
              placeholder="Ex : 10000679"
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Année</label>
            <select
              value={editAnnee}
              onChange={(e) => setEditAnnee(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">—</option>
              {ANNEES.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveCorrection}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 rounded-lg text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap justify-end">
        <button
          onClick={() => setShowEdit((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Modifier
        </button>

        {canEmettre && (
          <button
            onClick={emettre}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {spin("emettre") ?? <Send className="w-4 h-4" />}
            Émettre
          </button>
        )}

        {isEmise && (
          <button
            onClick={envoyerEmail}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {spin("envoyer") ?? <Send className="w-4 h-4" />}
            Envoyer par email
          </button>
        )}

        {canRelancer && (
          <button
            onClick={relancer}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 border border-orange-200 rounded-lg text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors"
          >
            {spin("relancer") ?? <Bell className="w-4 h-4" />}
            {hasRelances ? "Relancer" : "1ère relance"}
          </button>
        )}

        {canAvoir && (
          <button
            onClick={genererAvoir}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {spin("avoir") ?? <RotateCcw className="w-4 h-4" />}
            Générer un avoir
          </button>
        )}

        <button
          onClick={() => setShowPdfModal(true)}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <FileDown className="w-4 h-4" />
          PDF
        </button>
      </div>

      {showPdfModal && (
        <PdfModal
          type="facture"
          id={facture.id}
          numero={facture.numero}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {/* Toast confirmation */}
      {toast && (
        <div className="bg-green-600 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-1">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
