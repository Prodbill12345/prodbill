import { Asterisk } from "./Asterisk";

/**
 * Logo typographique ProdBill : compact, épais, légèrement italique
 * (oblique par transformation, Space Grotesk n'ayant pas d'italique),
 * accompagné de l'astérisque bleu.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-start gap-0.5 ${className ?? ""}`}>
      <span className="font-display text-[19px] font-bold leading-none tracking-[-0.04em] text-brand-ink inline-block -skew-x-[8deg]">
        ProdBill
      </span>
      <Asterisk size={11} className="-mt-0.5" />
    </span>
  );
}
