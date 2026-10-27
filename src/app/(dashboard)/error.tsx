"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";

// Erreur d'exécution dans une page du dashboard (C-REDESIGN-PHASE2-APP,
// étape 6). La sidebar reste affichée : seul le contenu est remplacé.
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <div className="max-w-md text-center">
        <Mascot size={110} className="mx-auto mb-6" />
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink mb-3">
          Quelque chose a{" "}
          <em className="font-editorial font-normal italic tracking-normal text-brand-blue">coincé</em>.
        </h1>
        <p className="text-sm text-brand-ink-muted mb-8">
          La page n&apos;a pas pu s&apos;afficher. Réessayez ; si ça persiste,
          transmettez la référence ci-dessous.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink transition-colors"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-medium text-brand-ink border border-brand-rule bg-brand-paper hover:bg-brand-surface transition-colors"
          >
            Tableau de bord
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 font-mono text-xs text-brand-ink-muted">Réf. {error.digest}</p>
        )}
      </div>
    </div>
  );
}
