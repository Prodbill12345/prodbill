"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

interface Props {
  companyId: string;
  companyName: string;
}

export function ImpersonateButton({ companyId, companyName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    if (!confirm(`Démarrer une session d'impersonation sur "${companyName}" ?\n\nToutes vos actions seront loguées dans AuditLog.`)) {
      return;
    }
    try {
      const res = await fetch("/api/admin/impersonate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => {
        router.push("/");
        router.refresh();
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 disabled:opacity-60 transition-all"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={2.5} />
        {isPending ? "…" : "Impersonate"}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
