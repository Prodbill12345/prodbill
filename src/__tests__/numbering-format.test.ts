/**
 * Tests du format de numéro unifié (#95).
 * Format sans préfixe : "YY" + compteur sur 3 chiffres ("26001").
 * La feature préfixe (Company.prefixDevis) reste fonctionnelle.
 */

import { formatNumero } from "../lib/numbering";

describe("formatNumero — format unifié (sans préfixe)", () => {
  test("value 1 → 26001", () => {
    expect(formatNumero(2026, 1)).toBe("26001");
  });

  test("value 42 → 26042", () => {
    expect(formatNumero(2026, 42)).toBe("26042");
  });

  test("value 999 → 26999", () => {
    expect(formatNumero(2026, 999)).toBe("26999");
  });

  test("année encodée sur 2 chiffres (2027)", () => {
    expect(formatNumero(2027, 1)).toBe("27001");
  });

  test("au-delà de 999 : pas d'amputation (débordement à 4 chiffres)", () => {
    expect(formatNumero(2026, 1000)).toBe("261000");
  });

  test("préfixe vide → format unifié", () => {
    expect(formatNumero(2026, 7, "")).toBe("26007");
  });
});

describe("formatNumero — feature préfixe conservée", () => {
  test("préfixe renseigné → préfixe + compteur brut", () => {
    expect(formatNumero(2026, 1, "DEV-2026-")).toBe("DEV-2026-1");
  });
});
