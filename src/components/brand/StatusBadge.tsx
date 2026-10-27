import { statusTones, type StatusTone } from "@/design/tokens";

/**
 * Badge de statut DA : pastille + fond teinté discret + libellé lisible
 * (le statut est porté par le texte, la couleur ne fait que l'appuyer).
 */
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const t = statusTones[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: t.bg, color: t.text, borderColor: t.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: t.dot }} aria-hidden />
      {label}
    </span>
  );
}
