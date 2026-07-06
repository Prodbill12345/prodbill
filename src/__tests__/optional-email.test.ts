/**
 * Tests du champ email optionnel client (C-CLIENT-EMAIL-OPTIONAL).
 * Vanda doit pouvoir créer un client sans email.
 */

import { optionalEmailField, normalizeOptionalEmail } from "../lib/optional-email";

describe("optionalEmailField (zod)", () => {
  test("adresse valide → acceptée", () => {
    expect(optionalEmailField.parse("contact@societe.fr")).toBe("contact@societe.fr");
  });

  test("chaîne vide → acceptée (pas d'email)", () => {
    expect(optionalEmailField.parse("")).toBe("");
  });

  test("undefined → accepté (champ absent)", () => {
    expect(optionalEmailField.parse(undefined)).toBeUndefined();
  });

  test("adresse invalide → rejetée", () => {
    expect(() => optionalEmailField.parse("pas-un-email")).toThrow();
  });
});

describe("normalizeOptionalEmail (DB)", () => {
  test('"" → null', () => {
    expect(normalizeOptionalEmail("")).toBeNull();
  });

  test("undefined → null", () => {
    expect(normalizeOptionalEmail(undefined)).toBeNull();
  });

  test("null → null", () => {
    expect(normalizeOptionalEmail(null)).toBeNull();
  });

  test("adresse → conservée", () => {
    expect(normalizeOptionalEmail("a@b.com")).toBe("a@b.com");
  });
});
