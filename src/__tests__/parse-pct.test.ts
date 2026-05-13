/**
 * Tests unitaires — parsing tolerant des pourcentages
 *
 * Couvre les cas de saisie utilisateur reels (virgule francaise, point,
 * vide, zero legitime, hors-bornes) pour eviter la regression du BUG #2
 * "je ne peux pas modifier les taux".
 */

import {
  parsePctInput,
  isValidPct,
  decimalToPct,
  pctToDecimal,
} from "../lib/parse-pct";

describe("parsePctInput", () => {
  test("\"5\" → 5", () => {
    expect(parsePctInput("5")).toBe(5);
  });

  test("\"5,5\" → 5.5 (virgule française)", () => {
    expect(parsePctInput("5,5")).toBe(5.5);
  });

  test("\"5.5\" → 5.5 (point anglosaxon)", () => {
    expect(parsePctInput("5.5")).toBe(5.5);
  });

  test("\" 5 \" → 5 (espaces autour)", () => {
    expect(parsePctInput(" 5 ")).toBe(5);
  });

  test("\"0\" → 0 (zéro légitime, distinct de null)", () => {
    expect(parsePctInput("0")).toBe(0);
  });

  test("\"100\" → 100 (borne haute valide)", () => {
    expect(parsePctInput("100")).toBe(100);
  });

  test("\"-1\" → -1 (parsing tolérant, validation séparée)", () => {
    expect(parsePctInput("-1")).toBe(-1);
  });

  test("\"101\" → 101 (parsing tolérant, validation séparée)", () => {
    expect(parsePctInput("101")).toBe(101);
  });

  test("\"\" → null (vide = absence de valeur, distinct de 0)", () => {
    expect(parsePctInput("")).toBeNull();
  });

  test("\"   \" → null (espaces seuls)", () => {
    expect(parsePctInput("   ")).toBeNull();
  });

  test("\"abc\" → null (non parsable)", () => {
    expect(parsePctInput("abc")).toBeNull();
  });

  test("undefined → null", () => {
    expect(parsePctInput(undefined)).toBeNull();
  });

  test("null → null", () => {
    expect(parsePctInput(null)).toBeNull();
  });

  test("number passthrough : 5 → 5", () => {
    expect(parsePctInput(5)).toBe(5);
  });

  test("number passthrough : 0 → 0", () => {
    expect(parsePctInput(0)).toBe(0);
  });

  test("NaN → null", () => {
    expect(parsePctInput(NaN)).toBeNull();
  });

  test("Infinity → null", () => {
    expect(parsePctInput(Infinity)).toBeNull();
  });

  test("objet → null (type non supporté)", () => {
    expect(parsePctInput({})).toBeNull();
  });
});

describe("isValidPct (validation 0..100)", () => {
  test("0 valide", () => expect(isValidPct(0)).toBe(true));
  test("100 valide", () => expect(isValidPct(100)).toBe(true));
  test("5.5 valide", () => expect(isValidPct(5.5)).toBe(true));
  test("-1 invalide", () => expect(isValidPct(-1)).toBe(false));
  test("101 invalide", () => expect(isValidPct(101)).toBe(false));
  test("null invalide", () => expect(isValidPct(null)).toBe(false));
});

describe("decimalToPct (DB → UI)", () => {
  test("0.05 → 5", () => expect(decimalToPct(0.05)).toBe(5));
  test("0.055 → 5.5", () => expect(decimalToPct(0.055)).toBe(5.5));
  test("0.15 → 15", () => expect(decimalToPct(0.15)).toBe(15));
  test("0.57 → 57", () => expect(decimalToPct(0.57)).toBe(57));
  test("0 → 0", () => expect(decimalToPct(0)).toBe(0));
  test("1 → 100", () => expect(decimalToPct(1)).toBe(100));
  test("absorbe l'erreur flottante : 0.1 + 0.2 → 30", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en flottant ; doit donner 30 (pas 30.000000…)
    expect(decimalToPct(0.1 + 0.2)).toBe(30);
  });
});

describe("pctToDecimal (UI → DB)", () => {
  test("5 → 0.05", () => expect(pctToDecimal(5)).toBe(0.05));
  test("5.5 → 0.055", () => expect(pctToDecimal(5.5)).toBe(0.055));
  test("15 → 0.15", () => expect(pctToDecimal(15)).toBe(0.15));
  test("57 → 0.57", () => expect(pctToDecimal(57)).toBe(0.57));
  test("0 → 0", () => expect(pctToDecimal(0)).toBe(0));
  test("100 → 1", () => expect(pctToDecimal(100)).toBe(1));
});

describe("round-trip decimalToPct ↔ pctToDecimal", () => {
  test.each([0, 0.05, 0.055, 0.15, 0.57, 0.65, 1])(
    "round-trip %f → pct → decimal préserve la valeur",
    (d) => {
      expect(pctToDecimal(decimalToPct(d))).toBeCloseTo(d, 4);
    }
  );
});
