import { Fragment } from "react";
import { parseBold } from "@/lib/text-bold";

/**
 * Affiche un texte au format `**gras**` (C-DESCRIPTION-GRAS) dans l'app :
 * segments en gras rendus en <strong>, le reste tel quel. Aucun HTML
 * interprété — React échappe le texte.
 */
export function BoldText({ text, boldClassName = "font-semibold" }: { text: string; boldClassName?: string }) {
  return (
    <>
      {parseBold(text).map((seg, i) =>
        seg.bold ? (
          <strong key={i} className={boldClassName}>
            {seg.text}
          </strong>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        )
      )}
    </>
  );
}
