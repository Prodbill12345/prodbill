import { colors } from "@/design/tokens";

/**
 * Astérisque graphique de la DA (logo, détails éditoriaux). Six branches
 * épaisses à bouts arrondis, légèrement irrégulières. Décoratif.
 */
export function Asterisk({
  size = 16,
  color = colors.accent,
  className,
}: {
  size?: number | string;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <g stroke={color} strokeWidth={4.2} strokeLinecap="round">
        <line x1="12" y1="2.5" x2="12" y2="21.5" />
        <line x1="3.6" y1="7" x2="20.4" y2="17" />
        <line x1="3.8" y1="17.2" x2="20.2" y2="6.8" />
      </g>
    </svg>
  );
}
