"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";

interface Document {
  id: string;
  name: string;
  createdAt: string;
}

interface DocumentsSectionProps {
  canEdit: boolean;
}

export function DocumentsSection({ canEdit }: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((json) => setDocuments(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) fileInputRef.current = e.target;
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Seuls les fichiers PDF sont acceptés.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("Le fichier ne doit pas dépasser 10 Mo.");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch(`/api/documents?filename=${encodeURIComponent(file.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur lors de l'upload");
        return;
      }

      const { data } = await res.json();
      setDocuments((prev) => [data, ...prev]);
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-uploaded
      e.target.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce document ?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur lors de la suppression");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Documents joints</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            PDF réutilisables (CGV, RGPD…) à joindre lors de la génération de PDF.
          </p>
        </div>
        {canEdit && (
          <label className={`flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "Upload…" : "Ajouter un PDF"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Aucun document enregistré</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-3">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                <p className="text-xs text-slate-400">Ajouté le {formatDate(doc.createdAt)}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleting === doc.id}
                  className="flex-shrink-0 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Supprimer"
                >
                  {deleting === doc.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
