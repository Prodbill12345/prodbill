/**
 * Tests unitaires — Validation Zod pour la période d'exploitation (#69).
 *
 * Couvre le superRefine `validatePeriodeExploitation` du helper Zod
 * commun (utilisé par les 3 schémas : DevisBuilder, POST + PUT API).
 *
 * Règles testées :
 *   1. Tout vide → OK (devis sans droits d'exploitation)
 *   2. Libellé seul → OK (cas "à définir")
 *   3. Début seul → KO (date orpheline)
 *   4. Fin seule → KO (date orpheline)
 *   5. Fin > Début → OK
 *   6. Fin = Début → OK (exploitation 1 jour)
 *   7. Fin < Début → KO
 *   8. Libellé > 255 caractères → KO
 */

import { z } from "zod";
import {
  periodeExploitationFields,
  validatePeriodeExploitation,
} from "../lib/zod-helpers";

const Schema = z
  .object(periodeExploitationFields)
  .superRefine(validatePeriodeExploitation);

describe("validatePeriodeExploitation", () => {
  test("tout vide → OK (pas de droits d'exploitation)", () => {
    const r = Schema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("libellé seul sans dates → OK ('à définir')", () => {
    const r = Schema.safeParse({
      periodeExploitationLibelle: "À définir avec le client",
    });
    expect(r.success).toBe(true);
  });

  test("début seul (fin manquante) → KO", () => {
    const r = Schema.safeParse({
      periodeExploitationDebut: "2026-06-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["periodeExploitationFin"]);
      expect(r.error.issues[0].message).toMatch(/fin manquante/i);
    }
  });

  test("fin seule (début manquant) → KO", () => {
    const r = Schema.safeParse({
      periodeExploitationFin: "2027-05-31",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["periodeExploitationDebut"]);
    }
  });

  test("fin > début → OK", () => {
    const r = Schema.safeParse({
      periodeExploitationDebut: "2026-06-01",
      periodeExploitationFin: "2027-05-31",
    });
    expect(r.success).toBe(true);
  });

  test("fin = début → OK (exploitation 1 jour)", () => {
    const r = Schema.safeParse({
      periodeExploitationDebut: "2026-06-01",
      periodeExploitationFin: "2026-06-01",
    });
    expect(r.success).toBe(true);
  });

  test("fin < début → KO", () => {
    const r = Schema.safeParse({
      periodeExploitationDebut: "2027-05-31",
      periodeExploitationFin: "2026-06-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path[0] === "periodeExploitationFin"
      );
      expect(issue?.message).toMatch(/après la date de début/i);
    }
  });

  test("libellé > 255 caractères → KO", () => {
    const r = Schema.safeParse({
      periodeExploitationLibelle: "x".repeat(256),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual([
        "periodeExploitationLibelle",
      ]);
    }
  });

  test("libellé exactement 255 caractères → OK", () => {
    const r = Schema.safeParse({
      periodeExploitationLibelle: "x".repeat(255),
    });
    expect(r.success).toBe(true);
  });

  test("dates + libellé combinés → OK", () => {
    const r = Schema.safeParse({
      periodeExploitationDebut: "2026-06-01",
      periodeExploitationFin: "2027-05-31",
      periodeExploitationLibelle: "Web Global + TV France 1 an",
    });
    expect(r.success).toBe(true);
  });
});
