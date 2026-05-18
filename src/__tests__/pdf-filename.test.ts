import {
  slugify,
  devisPdfFilename,
  facturePdfFilename,
} from "../lib/pdf-filename";

describe("slugify", () => {
  test("simple ASCII", () => {
    expect(slugify("K-LINE")).toBe("K-LINE");
  });

  test("espaces → underscores", () => {
    expect(slugify("Spot TV 2026")).toBe("Spot_TV_2026");
  });

  test("accents français retirés", () => {
    expect(slugify("Spot TV été 2026")).toBe("Spot_TV_ete_2026");
    expect(slugify("Cinéma à Paris")).toBe("Cinema_a_Paris");
    expect(slugify("Réalisation")).toBe("Realisation");
  });

  test("caractères interdits FS retirés", () => {
    expect(slugify("a/b\\c?d*e:f\"g<h>i|j")).toBe("abcdefghij");
  });

  test("multiples underscores collapsés", () => {
    expect(slugify("a   b")).toBe("a_b");
    expect(slugify("a___b")).toBe("a_b");
  });

  test("trim underscores aux bords", () => {
    expect(slugify("  a b  ")).toBe("a_b");
    expect(slugify("_a_b_")).toBe("a_b");
  });

  test("vide → 'untitled'", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify(null)).toBe("untitled");
    expect(slugify(undefined)).toBe("untitled");
  });

  test("tronqué à 80 chars", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});

describe("devisPdfFilename", () => {
  test("devis avec numéro et objet K-LINE", () => {
    expect(
      devisPdfFilename({ id: "abc", numero: "DEV-2026-26089", objet: "K-LINE" })
    ).toBe("DEV-2026-26089_K-LINE.pdf");
  });

  test("devis avec objet accentué", () => {
    expect(
      devisPdfFilename({ id: "abc", numero: "26089", objet: "Spot TV été 2026" })
    ).toBe("26089_Spot_TV_ete_2026.pdf");
  });

  test("devis brouillon (sans numéro)", () => {
    expect(
      devisPdfFilename({ id: "cmp1abcdef12345", numero: null, objet: "Test" })
    ).toBe("devis-brouillon-cmp1abcd_Test.pdf");
  });

  test("devis avec objet vide → 'untitled'", () => {
    expect(
      devisPdfFilename({ id: "abc", numero: "26000", objet: "" })
    ).toBe("26000_untitled.pdf");
  });
});

describe("facturePdfFilename", () => {
  test("facture avec devis lié et objet", () => {
    expect(
      facturePdfFilename({
        numero: "FAC-2026-26051",
        devis: { objet: "K-LINE" },
      })
    ).toBe("FAC-2026-26051_K-LINE.pdf");
  });

  test("facture sans devis lié (avoir manuel)", () => {
    expect(
      facturePdfFilename({ numero: "AV-2026-0001", devis: null })
    ).toBe("AV-2026-0001.pdf");
  });

  test("facture avec / dans le numéro (legacy) — sanitize", () => {
    expect(
      facturePdfFilename({ numero: "25/0042-A1", devis: null })
    ).toBe("25-0042-A1.pdf");
  });
});
