"use client";

import { useRef, useState } from "react";
import {
  Paperclip,
  Loader2,
  FileText,
  ExternalLink,
  Trash2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE_MB = 10;

export interface BdcClientInitial {
  url: string | null;
  filename: string | null;
  uploadedAt: string | Date | null;
}

interface BdcClientUploadFieldProps {
  devisId: string;
  /** État initial fourni par le parent (champs bdcClient* du devis). */
  initial: BdcClientInitial;
}

/**
 * Champ d'upload du BDC reçu DU client (PDF/JPG/PNG, 10 Mo max).
 * Distinct du BDC sortant auto-généré (modèle BDC, route /accepter)
 * et du champ numero BDC texte sur Facture. Ticket #79.
 *
 * Le composant gère son propre fetch et état — pas dans react-hook-form
 * du DevisBuilder parent : l'upload est un side-effect indépendant du
 * save du devis (le fichier est uploadé immédiatement, pas au submit).
 */
export function BdcClientUploadField({
  devisId,
  initial,
}: BdcClientUploadFieldProps) {
  const [current, setCurrent] = useState<BdcClientInitial>(initial);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFile = Boolean(current.url);

  function validateAndPickFile(file: File): string | null {
    if (!ALLOWED_MIME.includes(file.type)) {
      return "Format non supporté. Acceptés : PDF, JPG, PNG.";
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Le fichier dépasse ${MAX_SIZE_MB} Mo.`;
    }
    return null;
  }

  async function uploadFile(file: File) {
    const validationError = validateAndPickFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/devis/${devisId}/bdc-client`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Erreur lors de l'upload");
        return;
      }
      const { data } = (await res.json()) as {
        data: { url: string; filename: string; uploadedAt: string };
      };
      setCurrent({
        url: data.url,
        filename: data.filename,
        uploadedAt: data.uploadedAt,
      });
    } catch {
      setError("Erreur réseau, réessayez");
    } finally {
      setUploading(false);
      // reset l'input pour pouvoir re-uploader le même fichier après suppression
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteFile() {
    if (!confirm("Supprimer définitivement le BDC client ?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/devis/${devisId}/bdc-client`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Erreur lors de la suppression");
        return;
      }
      setCurrent({ url: null, filename: null, uploadedAt: null });
    } catch {
      setError("Erreur réseau, réessayez");
    } finally {
      setDeleting(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (uploading || deleting) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  const formattedDate = current.uploadedAt
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(current.uploadedAt))
    : null;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        BDC client
        <span
          className="ml-1.5 text-slate-400 font-normal cursor-help"
          title="Importez ici le BDC reçu de votre client (PDF ou scan)."
        >
          ⓘ
        </span>
      </label>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={onPick}
        className="hidden"
      />

      {/* Variante : fichier déjà uploadé */}
      {hasFile && !uploading && (
        <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm text-slate-700 truncate"
              title={current.filename ?? ""}
            >
              {current.filename}
            </p>
            {formattedDate && (
              <p className="text-xs text-slate-400">
                Uploadé le {formattedDate}
              </p>
            )}
          </div>
          <a
            href={current.url!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Ouvrir le BDC dans un nouvel onglet"
          >
            <ExternalLink className="w-3 h-3" />
            Voir
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || deleting}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-40"
            title="Remplacer par un autre fichier"
          >
            <RefreshCw className="w-3 h-3" />
            Remplacer
          </button>
          <button
            type="button"
            onClick={deleteFile}
            disabled={uploading || deleting}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
            title="Supprimer le BDC"
          >
            {deleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Supprimer
          </button>
        </div>
      )}

      {/* Variante : pas de fichier */}
      {!hasFile && !uploading && (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex items-center justify-center gap-2 px-3 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-sm text-slate-500"
          title="Importez ici le BDC reçu de votre client (PDF ou scan)."
        >
          <Paperclip className="w-4 h-4" />
          <span>
            Joindre le BDC client
            <span className="text-xs text-slate-400 ml-1">
              (PDF, JPG, PNG — max {MAX_SIZE_MB} Mo)
            </span>
          </span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={onPick}
            className="hidden"
          />
        </label>
      )}

      {/* Variante : upload en cours */}
      {uploading && (
        <div className="flex items-center justify-center gap-2 px-3 py-3 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>Upload en cours…</span>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 mt-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
