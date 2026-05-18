/**
 * Tests unitaires — Conversion FK optionnelle pour DevisLigne (BUG #3).
 *
 * Reproduit le scénario : un `<select>` HTML envoie `""` quand l'option
 * par défaut "Associer un agent (optionnel)" n'est pas changée. Sans la
 * transform Zod, cette chaîne vide arrive jusqu'à Prisma qui rejette
 * avec une violation FK (P2003).
 *
 * Le helper `optionalFkId` (cf. src/lib/zod-helpers.ts) doit :
 *   - "" → undefined
 *   - "abc123" (CUID valide) → "abc123"
 *   - undefined → undefined
 *   - null → undefined  (zod le rejette en mode strict, mais la chaîne
 *     traverse l'API JSON sous forme de undefined si le client le sérialise
 *     en undefined ; on teste le cas string + undefined)
 */

import { z } from "zod";
import { optionalFkId } from "../lib/zod-helpers";

describe("optionalFkId (Zod transform pour FK optionnelle)", () => {
  test('"" → undefined', () => {
    expect(optionalFkId.parse("")).toBeUndefined();
  });

  test('"some-cuid-id" → "some-cuid-id"', () => {
    const id = "cmp1abc23def456ghi789jkl0";
    expect(optionalFkId.parse(id)).toBe(id);
  });

  test("undefined → undefined", () => {
    expect(optionalFkId.parse(undefined)).toBeUndefined();
  });

  test('"  " (espaces) → "  " (pas trimmé, distinct de "")', () => {
    // Le helper ne fait que la coercion "" → undefined. Une chaîne
    // d'espaces n'est pas notre cas d'usage (HTML <select> ne produit pas
    // ça), donc passe telle quelle. Si on voulait normaliser, ce serait
    // un autre helper.
    expect(optionalFkId.parse("  ")).toBe("  ");
  });
});

describe("Régression BUG #3 — LigneSchema simulé", () => {
  // Reproduit la structure de LigneSchema des 2 routes API. Si la
  // production utilise optionalFkId, ce test garantit que "" est bien
  // traité comme undefined sur comedienId ET agentId.
  const LigneSchema = z.object({
    libelle: z.string().min(1),
    tag: z.enum(["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"]),
    quantite: z.number().positive(),
    prixUnit: z.number().min(0),
    comedienId: optionalFkId,
    agentId: optionalFkId,
    ordre: z.number().int(),
  });

  test('ligne avec comedienId="" et agentId="" : les 2 sont undefined après parsing', () => {
    const input = {
      libelle: "Voix off Vanda",
      tag: "ARTISTE" as const,
      quantite: 1,
      prixUnit: 500,
      comedienId: "",
      agentId: "",
      ordre: 0,
    };
    const parsed = LigneSchema.parse(input);
    expect(parsed.comedienId).toBeUndefined();
    expect(parsed.agentId).toBeUndefined();
  });

  test("ligne avec un comedienId valide mais agentId vide : seul agentId devient undefined", () => {
    const input = {
      libelle: "Voix off",
      tag: "ARTISTE" as const,
      quantite: 1,
      prixUnit: 500,
      comedienId: "cmp1abcdef",
      agentId: "",
      ordre: 0,
    };
    const parsed = LigneSchema.parse(input);
    expect(parsed.comedienId).toBe("cmp1abcdef");
    expect(parsed.agentId).toBeUndefined();
  });

  test("ligne sans les champs comedienId/agentId : les 2 sont undefined", () => {
    const input = {
      libelle: "Studio",
      tag: "STUDIO" as const,
      quantite: 1,
      prixUnit: 200,
      ordre: 1,
    };
    const parsed = LigneSchema.parse(input);
    expect(parsed.comedienId).toBeUndefined();
    expect(parsed.agentId).toBeUndefined();
  });

  test("mapping post-parsing : `?? null` transforme undefined en null comme attendu par Prisma", () => {
    // Reproduit le code des routes :
    //   comedienId: ligne.comedienId ?? null
    //   agentId:    ligne.agentId    ?? null
    const parsed = LigneSchema.parse({
      libelle: "L",
      tag: "ARTISTE" as const,
      quantite: 1,
      prixUnit: 0,
      comedienId: "",
      agentId: "",
      ordre: 0,
    });
    const mapped = {
      comedienId: parsed.comedienId ?? null,
      agentId: parsed.agentId ?? null,
    };
    expect(mapped.comedienId).toBeNull();
    expect(mapped.agentId).toBeNull();
  });
});
