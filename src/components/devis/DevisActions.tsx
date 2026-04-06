"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, CheckCircle, XCircle, FileDown, Receipt, Loader2, Pencil } from "lucide-react";
import type { Devis } from "@/types";

interface DevisActionsProps {
  devis: Devis & { factures?: { id: string }[] };
}

export function DevisActions({ devis }: DevisActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [acomptePct, setAcomptePct] = useState(50);

  async function action(endpoint: string, key: string) {
    setLoading(key);
    try {
      const res = await fetch(`/api/devis/${devis.id}/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur");
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function createFacture(type: "ACOMPTE" | "SOLDE") {
    setLoading(`facture-${type}`);
    try {
      const res = await fetch("/api/factures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          devisId: devis.id,
          type,
          pourcentage: type === "ACOMPTE" ? acomptePct : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur");
        return;
      }
      const { data } = await res.json();
      router.push(`/factures/${data.id}`);
    } finally {
      setLoading(null);
    }
  }

  const isLoading = (key: string) =>
    loading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : null;

  return (
    <div className="flex gap-2 flex-wrap justify-end">
      {(devis.statut === "BROUILLON" || devis.statut === "ENVOYE") && (
        <Link
          href={`/devis/${devis.id}/modifier`}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Modifier
        </Link>
      )}

      {devis.statut === "BROUILLON" && (
        <button
          onClick={() => action("envoyer", "envoyer")}
          className="flex items-center gap-2 px-3 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
        >
          {isLoading("envoyer") ?? <Send className="w-4 h-4" />}
          Envoyer
        </button>
      )}

      {devis.statut === "ENVOYE" && (
        <>
          <button
            onClick={() => action("accepter", "accepter")}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 rounded-lg text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            {isLoading("accepter") ?? <CheckCircle className="w-4 h-4" />}
            Marquer accepté
          </button>
          <button
            onClick={() => action("refuser", "refuser")}
            className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            {isLoading("refuser") ?? <XCircle className="w-4 h-4" />}
            Marquer refusé
          </button>
        </>
      )}

      {devis.statut === "ACCEPTE" && (
        <>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={100}
              value={acomptePct}
              onChange={(e) => setAcomptePct(Number(e.target.value))}
              className="w-14 text-center border border-slate-200 rounded-l-lg px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Pourcentage de l'acompte"
            />
            <button
              onClick={() => createFacture("ACOMPTE")}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-r-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {isLoading("facture-ACOMPTE") ?? <Receipt className="w-4 h-4" />}
              Acompte {acomptePct}%
            </button>
          </div>
          <button
            onClick={() => createFacture("SOLDE")}
            className="flex items-center gap-2 px-3 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
          >
            {isLoading("facture-SOLDE") ?? <Receipt className="w-4 h-4" />}
            Facture solde
          </button>
        </>
      )}

      <a
        href={`/api/devis/${devis.id}/pdf`}
        download
        className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <FileDown className="w-4 h-4" />
        PDF
      </a>
    </div>
  );
}
