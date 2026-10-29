/**
 * C-PDF-ACCENT-PAR-COMPANY : palette curée des accents PDF par société.
 */

import { z } from "zod";
import {
  colors,
  pdfAccents,
  PDF_ACCENT_KEYS,
  DEFAULT_PDF_ACCENT,
} from "../design/tokens";
import {
  toPdfAccentKey,
  resolveDevisPdfAccent,
  resolveFacturePdfAccent,
  pdfAccentColors,
} from "../lib/pdf-accent";

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

describe("palette pdfAccents", () => {
  test("5 accents, Majorelle par défaut = accent de l'app", () => {
    expect(PDF_ACCENT_KEYS).toEqual(["majorelle", "wine", "olive", "petrole", "ink"]);
    expect(DEFAULT_PDF_ACCENT).toBe("majorelle");
    expect(pdfAccents.majorelle.accent).toBe(colors.accent);
    expect(pdfAccents.majorelle.accentInk).toBe(colors.accentInk);
  });

  test.each(PDF_ACCENT_KEYS)("%s : accent AA sur crème et sur le bloc totaux", (key) => {
    expect(contrast(pdfAccents[key].accent, colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(pdfAccents[key].accent, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(PDF_ACCENT_KEYS)("%s : variante petits textes ≥ 6.5 sur crème", (key) => {
    expect(contrast(pdfAccents[key].accentInk, colors.cream)).toBeGreaterThanOrEqual(6.5);
  });

  test.each(PDF_ACCENT_KEYS.filter((k) => k !== "ink"))(
    "%s : se distingue du texte (sinon le numéro et le total se lisent en noir)",
    (key) => {
      expect(contrast(pdfAccents[key].accent, colors.ink)).toBeGreaterThanOrEqual(1.9);
    }
  );
});

describe("résolution de l'accent", () => {
  test("valeur absente ou inconnue → Majorelle", () => {
    expect(toPdfAccentKey(null)).toBe("majorelle");
    expect(toPdfAccentKey(undefined)).toBe("majorelle");
    expect(toPdfAccentKey("")).toBe("majorelle");
    expect(toPdfAccentKey("#ff0000")).toBe("majorelle");
    expect(toPdfAccentKey("toString")).toBe("majorelle");
    expect(toPdfAccentKey("wine")).toBe("wine");
  });

  test("devis : suit toujours le réglage actuel", () => {
    expect(resolveDevisPdfAccent("olive")).toBe("olive");
    expect(resolveDevisPdfAccent(null)).toBe("majorelle");
  });

  test("facture brouillon : suit le réglage actuel", () => {
    expect(resolveFacturePdfAccent({ emiseAt: null, pdfAccent: null }, "petrole")).toBe("petrole");
  });

  test("facture émise : accent figé, le réglage actuel est ignoré", () => {
    expect(resolveFacturePdfAccent({ emiseAt: new Date(), pdfAccent: "wine" }, "olive")).toBe("wine");
  });

  test("facture émise avant la fonctionnalité (snapshot NULL) → Majorelle", () => {
    expect(resolveFacturePdfAccent({ emiseAt: new Date(), pdfAccent: null }, "olive")).toBe("majorelle");
  });

  test("pdfAccentColors : couleurs de la palette, Majorelle par défaut", () => {
    expect(pdfAccentColors("olive")).toEqual({ accent: "#5C6B1F", accentInk: "#4A5718" });
    expect(pdfAccentColors(undefined)).toEqual({ accent: colors.accent, accentInk: colors.accentInk });
  });
});

describe("validation API (même enum que PUT /api/company)", () => {
  const schema = z.object({ pdfAccent: z.enum(PDF_ACCENT_KEYS).optional() });
  test("clé de la palette acceptée, couleur libre refusée", () => {
    expect(schema.safeParse({ pdfAccent: "petrole" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ pdfAccent: "#ff0000" }).success).toBe(false);
  });
});
