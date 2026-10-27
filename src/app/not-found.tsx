import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";

// 404 (C-REDESIGN-PHASE2-APP, étape 6) : URL inconnue ou notFound() sur une
// pièce absente / d'une autre société. Rendu dans le layout racine.
export default function NotFound() {
  return (
    <main className="flex-1 min-h-screen flex items-center justify-center bg-brand-cream px-4 py-16">
      <div className="max-w-md text-center">
        <Mascot size={120} className="mx-auto mb-6" />
        <p className="font-display text-xs font-medium uppercase tracking-[0.15em] text-brand-ink-muted mb-3">
          Erreur 404
        </p>
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-brand-ink mb-3">
          Cette page a{" "}
          <em className="font-editorial font-normal italic tracking-normal text-brand-blue">disparu</em>.
        </h1>
        <p className="text-sm text-brand-ink-muted mb-8">
          Le lien est peut-être erroné, ou la pièce n&apos;existe plus.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink transition-colors"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </main>
  );
}
