"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, CheckCircle, XCircle, FileDown, Receipt, Loader2, Pencil, Trash2, AlertTriangle, Copy, ShieldCheck, Undo2 } from "lucide-react";
import type { Devis } from "@/types";
import { PdfModal } from "@/components/shared/PdfModal";
import { isDevisFacturable } from "@/lib/devis-facturable";

interface DevisActionsProps {
  devis: Devis & { factures?: { id: string }[] };
}

export function DevisActions({ devis }: DevisActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [acomptePct, setAcomptePct] = useState(50);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Suppression : autorisée uniquement sur BROUILLON (la route DELETE
  // côté API applique aussi cette règle — c'est juste l'UX qui désactive
  // le bouton pour éviter le clic inutile + tooltip explicatif).
  const canDelete = devis.statut === "BROUILLON";
  const deleteDisabledReason = !canDelete
    ? "Suppression impossible — seuls les brouillons peuvent être supprimés."
    : null;

  async function deleteDevis() {
    setLoading("delete");
    try {
      const res = await fetch(`/api/devis/${devis.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Erreur lors de la suppression");
        return;
      }
      // Redirect vers la liste — la page actuelle n'existe plus.
      router.push("/devis");
      router.refresh();
    } finally {
      setLoading(null);
      setShowDeleteConfirm(false);
    }
  }

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

  async function dupliquer() {
    setLoading("dupliquer");
    try {
      const res = await fetch(`/api/devis/${devis.id}/dupliquer`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Erreur lors de la duplication");
        return;
      }
      const { data } = await res.json();
      // Redirect vers le nouveau brouillon en mode édition pour que
      // Vanda puisse ajuster avant l'émission.
      router.push(`/devis/${data.id}/modifier`);
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
      <Link
        href={`/devis/${devis.id}/modifier`}
        className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <Pencil className="w-4 h-4" />
        Modifier
      </Link>

      {devis.statut === "BROUILLON" && (
        <>
          {/* Valider = feu vert interne (Vanda), sans envoi mail (#96). */}
          <button
            onClick={() => action("valider", "valider")}
            className="flex items-center gap-2 px-3 py-2 bg-teal-600 rounded-lg text-sm font-medium text-white hover:bg-teal-700 transition-colors"
          >
            {isLoading("valider") ?? <ShieldCheck className="w-4 h-4" />}
            Valider
          </button>
          <button
            onClick={() => action("envoyer", "envoyer")}
            className="flex items-center gap-2 px-3 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
          >
            {isLoading("envoyer") ?? <Send className="w-4 h-4" />}
            Envoyer
          </button>
        </>
      )}

      {devis.statut === "VALIDE" && (
        <button
          onClick={() => action("devalider", "devalider")}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          {isLoading("devalider") ?? <Undo2 className="w-4 h-4" />}
          Annuler la validation
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

      {/* #97 : facturable dès VALIDE (validation interne) ou ACCEPTE. */}
      {isDevisFacturable(devis.statut) && (
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

      {/* Dupliquer — toujours disponible quel que soit le statut. Crée
          un brouillon en copie et redirige vers /modifier. Ticket #93. */}
      <button
        type="button"
        onClick={dupliquer}
        disabled={loading === "dupliquer"}
        title="Créer un brouillon copié à partir de ce devis"
        className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        {isLoading("dupliquer") ?? <Copy className="w-4 h-4" />}
        Dupliquer
      </button>

      <button
        onClick={() => setShowPdfModal(true)}
        className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <FileDown className="w-4 h-4" />
        PDF
      </button>

      {/* Bouton Supprimer — autorisé uniquement sur BROUILLON.
          Sur autres statuts : désactivé + tooltip explicatif. */}
      <button
        type="button"
        onClick={() => canDelete && setShowDeleteConfirm(true)}
        disabled={!canDelete}
        title={deleteDisabledReason ?? "Supprimer ce devis"}
        className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <Trash2 className="w-4 h-4" />
        Supprimer
      </button>

      {showPdfModal && (
        <PdfModal
          type="devis"
          id={devis.id}
          numero={devis.numero}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) =>
            e.target === e.currentTarget &&
            loading !== "delete" &&
            setShowDeleteConfirm(false)
          }
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Supprimer ce devis ?
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Êtes-vous sûr de vouloir supprimer le devis{" "}
                  <span className="font-medium text-slate-700">
                    {devis.numero ?? "(brouillon)"}
                  </span>{" "}
                  ? Cette action est définitive.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading === "delete"}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={deleteDevis}
                disabled={loading === "delete"}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading === "delete" && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {loading === "delete" ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
