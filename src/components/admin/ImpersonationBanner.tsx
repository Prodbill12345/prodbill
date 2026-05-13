"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut } from "lucide-react";

interface Props {
  impersonatedCompanyName: string;
  impersonatedUserName: string;
  impersonatedUserRole: string;
  realEmail: string;
}

export function ImpersonationBanner({
  impersonatedCompanyName,
  impersonatedUserName,
  impersonatedUserRole,
  realEmail,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleExit() {
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate/exit", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => {
        router.push("/admin/workspaces");
        router.refresh();
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="sticky top-0 z-50 bg-red-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
        <AlertTriangle className="w-5 h-5 shrink-0" strokeWidth={2.5} />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-bold tracking-wide uppercase text-xs">
            Mode impersonation
          </span>
          <span className="mx-2 opacity-50">·</span>
          <span>
            Vous consultez <strong className="font-semibold">{impersonatedCompanyName}</strong>{" "}
            en tant que <strong className="font-semibold">{impersonatedUserName}</strong>{" "}
            ({impersonatedUserRole}).
          </span>
          <span className="mx-2 opacity-50">·</span>
          <span className="opacity-80">
            Connecté en tant que {realEmail}. Toutes vos actions sont loguées dans AuditLog.
          </span>
          {error && (
            <span className="ml-3 inline-flex items-center gap-1 bg-red-800 px-2 py-0.5 rounded text-xs">
              Erreur : {error}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleExit}
          disabled={isPending}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-red-700 hover:bg-red-50 active:bg-red-100 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          <LogOut className="w-4 h-4" strokeWidth={2.5} />
          {isPending ? "Sortie…" : "Quitter le mode"}
        </button>
      </div>
    </div>
  );
}
