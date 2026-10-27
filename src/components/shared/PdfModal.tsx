"use client";

import { useState, useEffect } from "react";
import { X, FileDown, FileCode2, Loader2, FileText } from "lucide-react";

interface Document {
  id: string;
  name: string;
  createdAt: string;
}

interface PdfModalProps {
  type: "devis" | "facture";
  id: string;
  numero?: string | null;
  onClose: () => void;
}

export function PdfModal({ type, id, numero, onClose }: PdfModalProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingFacturx, setGeneratingFacturx] = useState(false);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((json) => setDocuments(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  function toggleDoc(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Le serveur expose le nom de fichier "officiel" via le header X-Filename
  // (URL-encoded). On le lit ici parce que l'attribut <a>.download surpasse
  // toujours Content-Disposition côté navigateur — sans ça on perdrait
  // le format DEVIS_/FACTURE_ généré par devisPdfFilename/facturePdfFilename.
  function filenameFromResponse(res: Response, fallback: string): string {
    const raw = res.headers.get("X-Filename");
    if (!raw) return fallback;
    try {
      return decodeURIComponent(raw);
    } catch {
      return fallback;
    }
  }

  // Le serveur renvoie un message métier explicite (ex : « la facture doit
  // être émise (numérotée) pour générer un Factur-X »). On l'affiche au lieu
  // d'un texte en dur : c'est précisément ce masquage qui a rendu l'incident
  // de juillet en prod inexplicable — l'utilisateur voyait « Erreur lors de
  // la génération du Factur-X » sans jamais savoir pourquoi.
  async function errorMessage(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? fallback;
  }

  async function generateFacturx() {
    setGeneratingFacturx(true);
    try {
      const res = await fetch(`/api/factures/${id}/facturx`);
      if (!res.ok) {
        alert(await errorMessage(res, "Erreur lors de la génération du Factur-X"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromResponse(
        res,
        numero ? `facturx-${numero}.pdf` : "facturx.pdf"
      );
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setGeneratingFacturx(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const qs = selected.size ? `?docs=${[...selected].join(",")}` : "";
      const endpoint = type === "devis" ? "devis" : "factures";
      const res = await fetch(`/api/${endpoint}/${id}/pdf${qs}`);
      if (!res.ok) {
        alert(await errorMessage(res, "Erreur lors de la génération du PDF"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = type === "devis" ? "devis" : "facture";
      a.href = url;
      a.download = filenameFromResponse(
        res,
        numero ? `${label}-${numero}.pdf` : `${label}.pdf`
      );
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-brand-paper rounded-[var(--radius-card)] w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-rule">
          <h2 className="text-base font-semibold text-brand-ink">
            Télécharger le PDF
          </h2>
          <button
            onClick={onClose}
            className="text-brand-ink-muted hover:text-brand-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-brand-ink-muted" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-brand-ink-muted py-2">
              Aucun document joint disponible.{" "}
              <a href="/parametres" className="text-brand-blue hover:underline">
                Ajouter des documents dans Paramètres
              </a>
            </p>
          ) : (
            <>
              <p className="text-sm text-brand-ink-muted mb-4">
                Sélectionnez les documents à joindre au PDF (optionnel) :
              </p>
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="w-4 h-4 rounded border-brand-rule text-brand-blue focus:ring-brand-blue"
                      />
                      <FileText className="w-4 h-4 text-brand-ink-muted flex-shrink-0" />
                      <span className="text-sm text-brand-ink group-hover:text-brand-ink truncate">
                        {doc.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-brand-rule bg-brand-surface">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-brand-ink-muted hover:text-brand-ink transition-colors"
          >
            Annuler
          </button>
          {type === "facture" && (
            <button
              onClick={generateFacturx}
              disabled={generatingFacturx}
              className="flex items-center gap-2 px-4 py-2 border border-status-info-bg text-brand-blue bg-brand-paper text-sm font-medium rounded-[var(--radius-control)] hover:bg-status-info-bg disabled:opacity-50 transition-colors"
            >
              {generatingFacturx ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileCode2 className="w-4 h-4" />
              )}
              {generatingFacturx ? "Génération…" : "Télécharger Factur-X"}
            </button>
          )}
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-brand-cream text-sm font-medium rounded-[var(--radius-control)] hover:bg-brand-ink disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            {generating ? "Génération…" : "Télécharger"}
          </button>
        </div>
      </div>
    </div>
  );
}
