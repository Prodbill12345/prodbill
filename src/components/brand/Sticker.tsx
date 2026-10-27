/**
 * Sticker circulaire rouge orangé, légèrement incliné (détail « collage » de
 * la DA). Texte en encre (contraste 5.4 sur le rouge orangé). Décoratif :
 * le message n'est pas une information nécessaire.
 */
export function Sticker({
  children,
  size = 76,
  rotate = -12,
  className,
}: {
  children: React.ReactNode;
  size?: number;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full bg-brand-coral text-brand-ink font-display font-bold leading-[0.95] text-center select-none ${className ?? ""}`}
      style={{ width: size, height: size, transform: `rotate(${rotate}deg)`, fontSize: size * 0.2 }}
    >
      {children}
    </span>
  );
}
