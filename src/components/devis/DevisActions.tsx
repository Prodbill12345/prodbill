"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, CheckCircle, XCircle, FileDown, Receipt, Loader2, Pencil, Trash2, AlertTriangle, Copy, ShieldCheck, Undo2, Lock } from "lucide-react";
import type { Devis } from "@/types";
import { PdfModal } from "@/components/shared/PdfModal";
import { isDevisFacturable } from "@/lib/devis-facturable";
import type { FacturationState } from "@/lib/devis-facturation-state";

interface DevisActionsProps {
  devis: Devis;
  /**
   * GUARD-DEVIS-DOUBLE-FACTURATION : état de facturation du devis, calculé
   * côté serveur avec le prédicat partagé getFacturationState. Le serveur
   * reste l'autorité (409 sur POST /api/factures) — ici on évite le clic
   * inutile et on explique pourquoi, avec la sortie quand il y en a une.
   */
  facturation: FacturationState;
}

export function DevisActions({ devis, facturation }: DevisActionsProps) {
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
        className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink-muted hover:bg-brand-surface transition-colors"
      >
        <Pencil className="w-4 h-4" />
        Modifier
      </Link>

      {devis.statut === "BROUILLON" && (
        <>
          {/* Valider = feu vert interne (Vanda), sans envoi mail (#96). */}
          <button
            onClick={() => action("valider", "valider")}
            className="flex items-center gap-2 px-3 py-2 bg-brand-pistachio rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-[#A4C64C] transition-colors"
          >
            {isLoading("valider") ?? <ShieldCheck className="w-4 h-4" />}
            Valider
          </button>
          <button
            onClick={() => action("envoyer", "envoyer")}
            className="flex items-center gap-2 px-3 py-2 border border-status-info-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-blue hover:bg-status-info-bg transition-colors"
          >
            {isLoading("envoyer") ?? <Send className="w-4 h-4" />}
            Envoyer
          </button>
        </>
      )}

      {devis.statut === "VALIDE" && (
        <button
          onClick={() => action("devalider", "devalider")}
          className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink-muted hover:bg-brand-surface transition-colors"
        >
          {isLoading("devalider") ?? <Undo2 className="w-4 h-4" />}
          Annuler la validation
        </button>
      )}

      {devis.statut === "ENVOYE" && (
        <>
          <button
            onClick={() => action("accepter", "accepter")}
            className="flex items-center gap-2 px-3 py-2 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink transition-colors"
          >
            {isLoading("accepter") ?? <CheckCircle className="w-4 h-4" />}
            Marquer accepté
          </button>
          <button
            onClick={() => action("refuser", "refuser")}
            className="flex items-center gap-2 px-3 py-2 border border-status-danger-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-coral-ink hover:bg-status-danger-bg transition-colors"
          >
            {isLoading("refuser") ?? <XCircle className="w-4 h-4" />}
            Marquer refusé
          </button>
        </>
      )}

      {/* #97/#99 : facturable dès VALIDE (validation interne), ENVOYE ou ACCEPTE.
          GUARD-DEVIS-DOUBLE-FACTURATION : les boutons restent VISIBLES mais
          désactivés quand la place est déjà prise — le devis facturé garde
          ainsi sa place dans l'historique, avec le motif en tooltip. */}
      {isDevisFacturable(devis.statut) && (
        <>
          {facturation.isInvoiced && (
            <span
              title={
                facturation.soldeBlockedReason ??
                facturation.acompteBlockedReason ??
                undefined
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--radius-control)] bg-brand-surface text-xs font-medium text-brand-ink-muted"
            >
              <Lock className="w-3.5 h-3.5" />
              {facturation.solde.exists ? "Facturé" : "Acompte facturé"}
            </span>
          )}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={100}
              value={acomptePct}
              onChange={(e) => setAcomptePct(Number(e.target.value))}
              disabled={!facturation.canCreateAcompte}
              className="w-14 text-center border border-brand-rule rounded-l-lg px-2 py-2 text-sm text-brand-ink focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-40 disabled:cursor-not-allowed"
              title="Pourcentage de l'acompte"
            />
            <button
              onClick={() => facturation.canCreateAcompte && createFacture("ACOMPTE")}
              disabled={!facturation.canCreateAcompte}
              title={facturation.acompteBlockedReason ?? "Générer une facture d'acompte"}
              className="flex items-center gap-2 px-3 py-2 bg-brand-blue rounded-r-lg text-sm font-medium text-brand-cream hover:bg-brand-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-blue"
            >
              {isLoading("facture-ACOMPTE") ?? <Receipt className="w-4 h-4" />}
              Acompte {acomptePct}%
            </button>
          </div>
          <button
            onClick={() => facturation.canCreateSolde && createFacture("SOLDE")}
            disabled={!facturation.canCreateSolde}
            title={facturation.soldeBlockedReason ?? "Générer la facture de solde"}
            className="flex items-center gap-2 px-3 py-2 border border-status-info-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-blue hover:bg-status-info-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {isLoading("facture-SOLDE") ?? <Receipt className="w-4 h-4" />}
            Facture solde
          </button>
        </>
      )}

      {/* Motif du blocage en clair sous les boutons — un tooltip seul est
          invisible au tactile et trop discret pour expliquer la sortie. */}
      {facturation.isInvoiced && isDevisFacturable(devis.statut) && (
        <p className="w-full text-right text-xs text-brand-ink-muted order-last">
          {facturation.soldeBlockedReason ?? facturation.acompteBlockedReason}
        </p>
      )}

      {/* Dupliquer — toujours disponible quel que soit le statut. Crée
          un brouillon en copie et redirige vers /modifier. Ticket #93. */}
      <button
        type="button"
        onClick={dupliquer}
        disabled={loading === "dupliquer"}
        title="Créer un brouillon copié à partir de ce devis"
        className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-brand-surface transition-colors disabled:opacity-50"
      >
        {isLoading("dupliquer") ?? <Copy className="w-4 h-4" />}
        Dupliquer
      </button>

      <button
        onClick={() => setShowPdfModal(true)}
        className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-brand-surface transition-colors"
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
        className="flex items-center gap-2 px-3 py-2 border border-status-danger-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-coral-ink hover:bg-status-danger-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm"
          onClick={(e) =>
            e.target === e.currentTarget &&
            loading !== "delete" &&
            setShowDeleteConfirm(false)
          }
        >
          <div className="bg-brand-paper rounded-[var(--radius-card)] w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-brand-rule flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-status-danger-bg flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-brand-coral-ink" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-brand-ink">
                  Supprimer ce devis ?
                </h2>
                <p className="text-sm text-brand-ink-muted mt-1">
                  Êtes-vous sûr de vouloir supprimer le devis{" "}
                  <span className="font-medium text-brand-ink">
                    {devis.numero ?? "(brouillon)"}
                  </span>{" "}
                  ? Cette action est définitive.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-brand-surface">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading === "delete"}
                className="px-4 py-2 text-sm font-medium text-brand-ink-muted hover:text-brand-ink transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={deleteDevis}
                disabled={loading === "delete"}
                className="flex items-center gap-2 px-4 py-2 bg-brand-coral text-brand-cream text-sm font-medium rounded-[var(--radius-control)] hover:bg-brand-coral-ink disabled:opacity-50 transition-colors"
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
