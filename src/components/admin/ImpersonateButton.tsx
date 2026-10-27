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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold text-brand-coral-ink bg-brand-paper border border-status-danger-bg hover:bg-status-danger-bg hover:border-status-danger-bg disabled:opacity-60 transition-all"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={2.5} />
        {isPending ? "…" : "Impersonate"}
      </button>
      {error && <span className="text-[10px] text-brand-coral-ink">{error}</span>}
    </div>
  );
}
