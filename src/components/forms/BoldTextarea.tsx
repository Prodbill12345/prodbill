"use client";

import { forwardRef, useCallback, useRef } from "react";
import { Bold } from "lucide-react";
import { toggleBold } from "@/lib/text-bold";

/**
 * Textarea avec bouton « B » et raccourci Ctrl+B / ⌘B (C-DESCRIPTION-GRAS).
 * Entoure la sélection de `**` (cf. src/lib/text-bold.ts) ou les retire.
 *
 * Compatible avec `register()` de react-hook-form comme avec un champ
 * contrôlé : la modification passe par l'insertion native du navigateur
 * (événement `input` réel → onChange, et Ctrl+Z fonctionne).
 */
type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const BoldTextarea = forwardRef<HTMLTextAreaElement, Props>(function BoldTextarea(
  { className, onKeyDown, disabled, ...rest },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef]
  );

  function applyBold() {
    const el = innerRef.current;
    if (!el || el.disabled || el.readOnly) return;
    const edit = toggleBold(el.value, el.selectionStart, el.selectionEnd);
    el.focus();
    // Sélection faite uniquement d'espaces : rien à mettre en gras.
    if (edit.insert === "" && edit.replaceStart === edit.replaceEnd) {
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      return;
    }
    el.setSelectionRange(edit.replaceStart, edit.replaceEnd);
    // Insertion native (pile d'annulation conservée) ; repli si indisponible.
    const done = document.execCommand("insertText", false, edit.insert);
    if (!done) {
      el.setRangeText(edit.insert, edit.replaceStart, edit.replaceEnd, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  }

  return (
    <div className="relative">
      <textarea
        ref={setRefs}
        disabled={disabled}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
            e.preventDefault();
            applyBold();
            return;
          }
          onKeyDown?.(e);
        }}
        className={`${className ?? ""} pr-11`}
        {...rest}
      />
      <button
        type="button"
        // mousedown empêché : le clic ne retire pas la sélection du champ.
        onMouseDown={(e) => e.preventDefault()}
        onClick={applyBold}
        disabled={disabled}
        aria-label="Mettre en gras (Ctrl+B / ⌘B)"
        title="Gras (Ctrl+B / ⌘B)"
        className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-[6px] text-brand-ink-muted hover:text-brand-ink hover:bg-brand-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Bold className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
});
