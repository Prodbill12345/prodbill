/**
 * Tests FIX-FACTURX-TVA + mention Factur-X (option C, avant CONFORMITE-2027).
 *
 * 1. Bloc TVA du XML : catégorie et taux réels (plus de E/0 % codé en dur).
 * 2. Mention « Factur-X » en pied du PDF classique : émises seulement.
 */

import { buildFacturxTaxBlock, facturxMention } from "../lib/facturx-tax";

describe("buildFacturxTaxBlock", () => {
  test("TVA 20 % → catégorie S, taux 20.00, pas de motif d'exonération", () => {
    const xml = buildFacturxTaxBlock({ tauxTva: 20, tva: 920.64, totalHt: 4603.2, tvaMention: null });
    expect(xml).toContain("<ram:CalculatedAmount>920.64</ram:CalculatedAmount>");
    expect(xml).toContain("<ram:BasisAmount>4603.20</ram:BasisAmount>");
    expect(xml).toContain("<ram:CategoryCode>S</ram:CategoryCode>");
    expect(xml).toContain("<ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>");
    expect(xml).not.toContain("ExemptionReason");
  });

  test("taux réduit 5,5 % → S / 5.50", () => {
    const xml = buildFacturxTaxBlock({ tauxTva: 5.5, tva: 55, totalHt: 1000, tvaMention: null });
    expect(xml).toContain("<ram:CategoryCode>S</ram:CategoryCode>");
    expect(xml).toContain("<ram:RateApplicablePercent>5.50</ram:RateApplicablePercent>");
  });

  test("TVA 0 % avec mention → E, motif = mention (échappée)", () => {
    const xml = buildFacturxTaxBlock({
      tauxTva: 0,
      tva: 0,
      totalHt: 1000,
      tvaMention: "Autoliquidation — art. 283-2 & 259 B",
    });
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(xml).toContain("<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>");
    expect(xml).toContain(
      "<ram:ExemptionReason>Autoliquidation — art. 283-2 &amp; 259 B</ram:ExemptionReason>"
    );
    expect(xml).toContain("<ram:CalculatedAmount>0.00</ram:CalculatedAmount>");
  });

  test("TVA 0 % sans mention → motif par défaut identique au PDF (Art. 293 B)", () => {
    const xml = buildFacturxTaxBlock({ tauxTva: 0, tva: 0, totalHt: 1000, tvaMention: "  " });
    expect(xml).toContain("<ram:ExemptionReason>Art. 293 B du CGI</ram:ExemptionReason>");
  });

  test("ordre XSD : ExemptionReason entre TypeCode et BasisAmount, Category avant Rate", () => {
    const xml = buildFacturxTaxBlock({ tauxTva: 0, tva: 0, totalHt: 10, tvaMention: "x" });
    const order = ["CalculatedAmount", "TypeCode", "ExemptionReason", "BasisAmount", "CategoryCode", "RateApplicablePercent"]
      .map((tag) => xml.indexOf(`<ram:${tag}>`));
    expect(order.every((pos) => pos >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("plus aucune mention EN 16931 dans le bloc", () => {
    const xml = buildFacturxTaxBlock({ tauxTva: 20, tva: 2, totalHt: 10, tvaMention: null });
    expect(xml).not.toMatch(/16931/);
  });
});

describe("facturxMention", () => {
  test("facture émise → mention sans profil", () => {
    const m = facturxMention({ numero: "26005", type: "SOLDE" });
    expect(m).toBe("Facture disponible au format Factur-X");
    expect(m).not.toMatch(/16931/);
  });

  test("avoir émis → libellé Avoir", () => {
    expect(facturxMention({ numero: "AV-26005", type: "AVOIR" })).toBe(
      "Avoir disponible au format Factur-X"
    );
  });

  test("brouillon (numero null) → aucune mention", () => {
    expect(facturxMention({ numero: null, type: "ACOMPTE" })).toBeNull();
  });
});
