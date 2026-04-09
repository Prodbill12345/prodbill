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

  async function generateFacturx() {
    setGeneratingFacturx(true);
    try {
      const res = await fetch(`/api/factures/${id}/facturx`);
      if (!res.ok) {
        alert("Erreur lors de la génération du Factur-X");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = numero ? `facturx-${numero}.pdf` : "facturx.pdf";
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
        alert("Erreur lors de la génération du PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = type === "devis" ? "devis" : "facture";
      a.href = url;
      a.download = numero ? `${label}-${numero}.pdf` : `${label}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            Télécharger le PDF
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              Aucun document joint disponible.{" "}
              <a href="/parametres" className="text-blue-600 hover:underline">
                Ajouter des documents dans Paramètres
              </a>
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-4">
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
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 group-hover:text-slate-900 truncate">
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Annuler
          </button>
          {type === "facture" && (
            <button
              onClick={generateFacturx}
              disabled={generatingFacturx}
              className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 bg-white text-sm font-medium rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
