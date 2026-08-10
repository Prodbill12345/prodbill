/**
 * Tests numérotation facture séquentielle (#98).
 *
 * Couvre :
 *   - Affichage préfixe "F" (formatFactureNumero)
 *   - Brouillon sans numéro → "Brouillon"
 *   - Avoir (numero "AV-…") affiché tel quel
 *   - Nom de fichier PDF null-safe (facturePdfFilename)
 *   - Format séquentiel du numéro à l'émission (formatNumero via getNext…)
 *   - Recherche/tri liste null-safe (factures-filters)
 */

import {
  formatFactureNumero,
  factureNumeroForFilename,
} from "../lib/facture-numero";
import { facturePdfFilename } from "../lib/pdf-filename";
import { formatNumero } from "../lib/numbering";
import {
  filterFactures,
  FACTURE_SORT_ACCESSORS,
  type FactureFilterable,
} from "../lib/factures-filters";

describe("formatFactureNumero — affichage préfixe F", () => {
  test("numéro nu → préfixe F", () => {
    expect(formatFactureNumero({ numero: "26005" })).toBe("F26005");
  });

  test("brouillon (null) → Brouillon", () => {
    expect(formatFactureNumero({ numero: null })).toBe("Brouillon");
  });

  test("avoir (AV-…) → tel quel (pas de double préfixe)", () => {
    expect(formatFactureNumero({ numero: "AV-26005" })).toBe("AV-26005");
  });
});

describe("factureNumeroForFilename", () => {
  test("null → BROUILLON", () => {
    expect(factureNumeroForFilename({ numero: null })).toBe("BROUILLON");
  });
  test("numéro conservé", () => {
    expect(factureNumeroForFilename({ numero: "26005" })).toBe("26005");
  });
});

describe("facturePdfFilename — null-safe (brouillon générable)", () => {
  test("brouillon sans devis → FACTURE_BROUILLON.pdf", () => {
    expect(facturePdfFilename({ numero: null })).toBe("FACTURE_BROUILLON.pdf");
  });
  test("brouillon avec devis → slug objet", () => {
    expect(
      facturePdfFilename({ numero: null, devis: { objet: "Spot TV" } })
    ).toBe("FACTURE_BROUILLON_Spot_TV.pdf");
  });
  test("facture numérotée", () => {
    expect(facturePdfFilename({ numero: "26005" })).toBe("FACTURE_26005.pdf");
  });
});

describe("format séquentiel du numéro attribué à l'émission", () => {
  // getNextFactureNumero (DB) délègue à formatNumero(year, value).
  test("value 1 → 26001, value 5 → 26005 (F26005 attendu par NONNA)", () => {
    expect(formatNumero(2026, 1)).toBe("26001");
    expect(formatNumero(2026, 5)).toBe("26005");
    expect(formatFactureNumero({ numero: formatNumero(2026, 5) })).toBe("F26005");
  });
});

describe("factures-filters — null-safe (brouillons sans numéro)", () => {
  const mk = (over: Partial<FactureFilterable>): FactureFilterable => ({
    numero: null,
    numeroBdc: null,
    type: "SOLDE",
    statut: "BROUILLON",
    dateEmission: null,
    dateEcheance: null,
    dateReglement: null,
    totalTtc: 0,
    client: { name: "Client" },
    ...over,
  });

  test("tri par numéro : brouillon (null) traité comme chaîne vide, pas de crash", () => {
    const a = mk({ numero: "26005" });
    const b = mk({ numero: null });
    expect(FACTURE_SORT_ACCESSORS.numero(a)).toBe("26005");
    expect(FACTURE_SORT_ACCESSORS.numero(b)).toBe("");
  });

  test('recherche "F26005" matche via le numéro affiché', () => {
    const list = [mk({ numero: "26005" }), mk({ numero: "26006" })];
    const out = filterFactures(list, { q: "F26005" });
    expect(out).toHaveLength(1);
    expect(out[0].numero).toBe("26005");
  });

  test('recherche "Brouillon" matche les factures sans numéro', () => {
    const list = [mk({ numero: null }), mk({ numero: "26006" })];
    const out = filterFactures(list, { q: "brouillon" });
    expect(out).toHaveLength(1);
    expect(out[0].numero).toBeNull();
  });
});
