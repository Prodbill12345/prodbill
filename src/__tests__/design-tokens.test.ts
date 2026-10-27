/**
 * C-REDESIGN-PHASE2-APP : src/design/tokens.ts est la source de vérité de la
 * DA. Les variables Tailwind de src/app/globals.css doivent en être le reflet
 * exact — ce test casse dès qu'un des deux côtés diverge.
 */

import { readFileSync } from "fs";
import path from "path";
import { colors, cssVars, statusTones } from "../design/tokens";

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");

/** Valeur déclarée pour une variable dans globals.css (première occurrence). */
function cssValue(name: string): string | null {
  const m = new RegExp(`${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : null;
}

describe("tokens.ts ↔ globals.css", () => {
  test.each(Object.entries(cssVars))("%s déclarée avec la valeur du token", (name, value) => {
    expect(cssValue(name)?.toLowerCase()).toBe(value.toLowerCase());
  });
});

// Contraste WCAG 2.x
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("contrastes AA (texte normal ≥ 4.5)", () => {
  test.each([
    ["ink / cream", colors.ink, colors.cream],
    ["inkMuted / cream (labels)", colors.inkMuted, colors.cream],
    ["inkMuted / surface (labels sur bloc secondaire)", colors.inkMuted, colors.surface],
    ["accent / cream", colors.accent, colors.cream],
    ["cream / accent (grande carte bleue)", colors.cream, colors.accent],
    ["cream / ink (capsule de nav active)", colors.cream, colors.ink],
    ["coralInk / cream (texte d'alerte)", colors.coralInk, colors.cream],
    ["coralInk / paper", colors.coralInk, colors.paper],
    ["pistachioInk / cream (texte positif)", colors.pistachioInk, colors.cream],
    ["pistachioInk / paper", colors.pistachioInk, colors.paper],
  ])("%s", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(
    Object.entries(statusTones).filter(([, t]) => t.bg !== "transparent")
  )("badge %s : texte lisible sur son fond", (_tone, t) => {
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("badge muted (fond transparent) : texte lisible sur crème", () => {
    expect(contrast(statusTones.muted.text, colors.cream)).toBeGreaterThanOrEqual(4.5);
  });

  test("garde-fou : rouge orangé et pistache ne sont PAS des couleurs de texte", () => {
    expect(contrast(colors.coral, colors.cream)).toBeLessThan(4.5);
    expect(contrast(colors.pistachio, colors.cream)).toBeLessThan(4.5);
  });
});

describe("statuts → tons de badge (src/design/status.ts)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DEVIS_STATUT_TONE, FACTURE_STATUT_TONE } = require("../design/status");

  test("chaque statut devis/facture a un ton existant", () => {
    for (const tone of [...Object.values(DEVIS_STATUT_TONE), ...Object.values(FACTURE_STATUT_TONE)]) {
      expect(statusTones).toHaveProperty(tone as string);
    }
    expect(Object.keys(DEVIS_STATUT_TONE).sort()).toEqual(
      ["ACCEPTE", "BROUILLON", "ENVOYE", "EXPIRE", "REFUSE", "VALIDE"]
    );
    expect(Object.keys(FACTURE_STATUT_TONE).sort()).toEqual(
      ["ANNULEE", "BROUILLON", "EMISE", "EN_RETARD", "PAYEE", "PAYEE_PARTIEL"]
    );
  });

  test("Validé (interne) visuellement distinct d'Accepté (client) — #96", () => {
    expect(DEVIS_STATUT_TONE.VALIDE).not.toBe(DEVIS_STATUT_TONE.ACCEPTE);
  });

  test("badge validated (fond transparent) : texte lisible sur crème et sur papier", () => {
    expect(contrast(statusTones.validated.text, colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(statusTones.validated.text, colors.paper)).toBeGreaterThanOrEqual(4.5);
  });
});
