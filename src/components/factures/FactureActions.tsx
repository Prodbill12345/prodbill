"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Send, RotateCcw, Loader2, Bell, Pencil, X, Check, CircleCheckBig, Undo2, Trash2, AlertTriangle } from "lucide-react";
import type { Facture } from "@/types";
import { PdfModal } from "@/components/shared/PdfModal";
import { canEditFactureObjet } from "@/lib/facture-objet";

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Formulaire de correction
  const [showEdit, setShowEdit] = useState(false);
  const initAnnee = facture.dateEmission
    ? String(new Date(facture.dateEmission).getFullYear())
    : "";
  const [editBdc, setEditBdc] = useState(facture.numeroBdc ?? "");
  const [editAnnee, setEditAnnee] = useState(initAnnee);
  // FEAT-FACTURE-OBJET-DESCRIPTION : éditables en brouillon uniquement.
  const objetEditable = canEditFactureObjet(facture);
  const [editObjet, setEditObjet] = useState(facture.objet ?? "");
  const [editDescription, setEditDescription] = useState(facture.descriptionProjet ?? "");
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
          numeroBdc: editBdc.trim() || null,
          dateEmission,
          // Envoyés seulement en brouillon : la route les refuse (400) après
          // émission, la correction du BDC doit rester possible.
          ...(objetEditable && {
            objet: editObjet.trim() || null,
            descriptionProjet: editDescription.trim() || null,
          }),
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

  // FEAT-FACTURE-BROUILLON-DELETE — suppression d'un brouillon.
  // Le bouton n'est rendu qu'en BROUILLON ; la route DELETE applique la
  // même règle (400 explicite sinon) via canDeleteFacture().
  async function deleteFacture() {
    setLoading("delete");
    try {
      const res = await fetch(`/api/factures/${facture.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Erreur lors de la suppression");
        return;
      }
      // La page courante n'existe plus — retour à la liste.
      router.push("/factures");
      router.refresh();
    } finally {
      setLoading(null);
      setShowDeleteConfirm(false);
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

  async function marquerPayee() {
    const data = await post("payee", "payee");
    if (data) {
      showToast("Facture marquée payée");
      router.refresh();
    }
  }

  async function annulerPaiement() {
    if (!confirm("Annuler le paiement et remettre la facture en émise ?")) return;
    const data = await post("unpay", "unpay");
    if (data) {
      showToast("Paiement annulé, facture remise en émise");
      router.refresh();
    }
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

  // Ticket #92 — bouton "Marquer payée" : disponible sur facture en
  // statut "à payer". On utilise le STATUT comme source de vérité (pas
  // emiseAt), aligné sur canAvoir : certaines factures historiques de
  // NONNA ont statut=EMISE avec emiseAt=null (import pré-champ-emiseAt),
  // et le pattern isEmise=!!emiseAt les masquait à tort.
  const canMarquerPayee =
    facture.type !== "AVOIR" &&
    (facture.statut === "EMISE" ||
      facture.statut === "EN_RETARD" ||
      facture.statut === "PAYEE_PARTIEL");
  const canAnnulerPaiement = facture.statut === "PAYEE";

  // Suppression : brouillons uniquement (FEAT-FACTURE-BROUILLON-DELETE).
  // Contrairement aux devis (bouton désactivé + tooltip), on masque
  // complètement le bouton hors BROUILLON : sur une facture émise la
  // suppression n'est pas "temporairement indisponible", elle est
  // légalement exclue — la voie de sortie est l'avoir.
  const canDelete = facture.statut === "BROUILLON" && !facture.emiseAt;

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Formulaire de correction inline */}
      {showEdit && (
        <div className="bg-brand-surface border border-brand-rule rounded-[var(--radius-card)] p-4 w-80 space-y-3">
          <p className="text-xs font-semibold text-brand-ink-muted uppercase tracking-wider">Corriger la facture</p>
          {objetEditable && (
            <>
              <div>
                <label className="block text-xs text-brand-ink-muted mb-1">Objet</label>
                <input
                  type="text"
                  value={editObjet}
                  onChange={(e) => setEditObjet(e.target.value)}
                  placeholder="Ex : Production du spot TV Marque X"
                  className="w-full px-2.5 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-brand-ink-muted mb-1">Description du projet</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-2.5 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-brand-ink-muted mb-1">N° BDC client</label>
            <input
              type="text"
              value={editBdc}
              onChange={(e) => setEditBdc(e.target.value)}
              placeholder="Ex : 10000679"
              className="w-full px-2.5 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label className="block text-xs text-brand-ink-muted mb-1">Année</label>
            <select
              value={editAnnee}
              onChange={(e) => setEditAnnee(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm bg-brand-paper focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="">—</option>
              {ANNEES.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveCorrection}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue rounded-[var(--radius-control)] text-xs font-medium text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-xs font-medium text-brand-ink-muted hover:bg-brand-surface transition-colors"
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
          className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink-muted hover:bg-brand-surface transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Modifier
        </button>

        {canEmettre && (
          <button
            onClick={emettre}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
          >
            {spin("emettre") ?? <Send className="w-4 h-4" />}
            Émettre
          </button>
        )}

        {isEmise && (
          <button
            onClick={envoyerEmail}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
          >
            {spin("envoyer") ?? <Send className="w-4 h-4" />}
            Envoyer par email
          </button>
        )}

        {canRelancer && (
          <button
            onClick={relancer}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 border border-status-danger-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-coral-ink hover:bg-status-danger-bg disabled:opacity-50 transition-colors"
          >
            {spin("relancer") ?? <Bell className="w-4 h-4" />}
            {hasRelances ? "Relancer" : "1ère relance"}
          </button>
        )}

        {/* Ticket #92 — bouton "Marquer payée" : 1 clic pour basculer en
            PAYEE sans saisir le détail du paiement. Crée un Paiement
            auto mode MARQUEE_MANUELLE en arrière-plan, qui pourra être
            annulé via le bouton "Annuler le paiement" ci-dessous. */}
        {canMarquerPayee && (
          <button
            onClick={marquerPayee}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
          >
            {spin("payee") ?? <CircleCheckBig className="w-4 h-4" />}
            Marquer payée
          </button>
        )}

        {canAnnulerPaiement && (
          <button
            onClick={annulerPaiement}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink-muted hover:bg-brand-surface disabled:opacity-50 transition-colors"
            title="Remettre la facture en émise et annuler le paiement automatique"
          >
            {spin("unpay") ?? <Undo2 className="w-4 h-4" />}
            Annuler le paiement
          </button>
        )}

        {canAvoir && (
          <button
            onClick={genererAvoir}
            disabled={loading !== null}
            className="flex items-center gap-2 px-3 py-2 border border-status-danger-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-coral-ink hover:bg-status-danger-bg disabled:opacity-50 transition-colors"
          >
            {spin("avoir") ?? <RotateCcw className="w-4 h-4" />}
            Générer un avoir
          </button>
        )}

        <button
          onClick={() => setShowPdfModal(true)}
          className="flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-brand-surface transition-colors"
        >
          <FileDown className="w-4 h-4" />
          PDF
        </button>

        {/* Supprimer — brouillons uniquement. Une facture émise est
            immuable (art. 289 CGI) : on passe par « Générer un avoir ». */}
        {canDelete && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading !== null}
            title="Supprimer ce brouillon de facture"
            className="flex items-center gap-2 px-3 py-2 border border-status-danger-bg rounded-[var(--radius-control)] text-sm font-medium text-brand-coral-ink hover:bg-status-danger-bg disabled:opacity-50 transition-colors"
          >
            {spin("delete") ?? <Trash2 className="w-4 h-4" />}
            Supprimer
          </button>
        )}
      </div>

      {showPdfModal && (
        <PdfModal
          type="facture"
          id={facture.id}
          numero={facture.numero}
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
                  Supprimer ce brouillon de facture ?
                </h2>
                <p className="text-sm text-brand-ink-muted mt-1">
                  Êtes-vous sûr de vouloir supprimer ce brouillon
                  {facture.numero ? ` (${facture.numero})` : ""} ? Cette action
                  est définitive. Les devis rattachés redeviendront facturables.
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
                onClick={deleteFacture}
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

      {/* Toast confirmation */}
      {toast && (
        <div className="bg-brand-blue text-brand-cream text-xs font-medium px-3 py-2 rounded-[var(--radius-control)] animate-in fade-in slide-in-from-top-1">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
