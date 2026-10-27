"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputPctProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "inputMode"
  > {
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * Input dédié à la saisie d'un pourcentage entier ou décimal.
 *
 * - `type="text"` + `inputMode="decimal"` pour ne pas bloquer la virgule
 *   française et afficher le clavier numérique sur mobile.
 * - Suffix `%` visuellement intégré.
 * - Aria-labels et autocompletes désactivés.
 *
 * Le parsing tolérant (virgule, point, espaces) est fait par
 * `parsePctInput()` dans `@/lib/parse-pct`. Ce composant est purement
 * visuel ; la conversion en décimal et la validation sont du ressort
 * du formulaire qui l'utilise (typiquement via `setValueAs` de
 * react-hook-form ou un Controller).
 */
export const InputPct = forwardRef<HTMLInputElement, InputPctProps>(
  function InputPct({ className, disabled, invalid, placeholder, ...rest }, ref) {
    return (
      <div className="relative">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ?? "5"}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            "w-full pl-3 pr-8 py-2 border rounded-[var(--radius-control)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue",
            invalid
              ? "border-status-danger-bg focus:ring-brand-coral"
              : "border-brand-rule",
            disabled && "bg-brand-surface text-brand-ink-muted cursor-not-allowed",
            className
          )}
          {...rest}
        />
        <span
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium pointer-events-none select-none",
            disabled ? "text-brand-ink-subtle" : "text-brand-ink-muted"
          )}
        >
          %
        </span>
      </div>
    );
  }
);
