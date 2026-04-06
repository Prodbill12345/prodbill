"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Send, RotateCcw, Loader2, Bell } from "lucide-react";
import type { Facture } from "@/types";

interface FactureActionsProps {
  facture: Facture;
  hasRelances?: boolean; // pour libellé du bouton relancer
}

export function FactureActions({ facture, hasRelances = false }: FactureActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      <div className="flex gap-2 flex-wrap justify-end">
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

        <a
          href={`/api/factures/${facture.id}/pdf`}
          download
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <FileDown className="w-4 h-4" />
          PDF
        </a>
      </div>

      {/* Toast confirmation */}
      {toast && (
        <div className="bg-green-600 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-1">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
