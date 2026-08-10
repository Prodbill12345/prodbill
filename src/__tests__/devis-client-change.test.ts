/**
 * Tests BUG-DEVIS-EDIT-CLIENT.
 *
 * 1. Régression schéma : le PUT retenait `clientId` (avant le fix, zod le
 *    strippait → le changement de client ne persistait jamais).
 * 2. Règle métier evaluateClientChange (option 1) : client modifiable
 *    seulement sur BROUILLON/VALIDE et sans facture.
 */

import { z } from "zod";
import type { DevisStatut } from "@prisma/client";
import { evaluateClientChange } from "../lib/devis-client-change";

// Reproduit la partie pertinente du schéma PUT après fix.
const UpdateDevisSchemaExcerpt = z.object({
  clientId: z.string().min(1).optional(),
  objet: z.string().min(1).optional(),
});

describe("régression : le schéma PUT conserve clientId", () => {
  test("clientId présent après parse (n'est plus strippé)", () => {
    const parsed = UpdateDevisSchemaExcerpt.parse({
      objet: "Titre",
      clientId: "cli-nouveau",
    });
    expect(parsed.clientId).toBe("cli-nouveau");
  });

  test("clientId absent → optionnel, pas d'erreur", () => {
    const parsed = UpdateDevisSchemaExcerpt.parse({ objet: "Titre" });
    expect(parsed.clientId).toBeUndefined();
  });
});

describe("evaluateClientChange", () => {
  const base = {
    currentClientId: "cli-A",
    currentStatut: "BROUILLON" as DevisStatut,
    facturesCount: 0,
  };

  test("clientId absent → no-change", () => {
    expect(evaluateClientChange({ ...base, newClientId: undefined })).toBe("no-change");
  });

  test("clientId identique → no-change", () => {
    expect(evaluateClientChange({ ...base, newClientId: "cli-A" })).toBe("no-change");
  });

  test("BROUILLON, sans facture, nouveau client → allowed", () => {
    expect(evaluateClientChange({ ...base, newClientId: "cli-B" })).toBe("allowed");
  });

  test("VALIDE, sans facture, nouveau client → allowed", () => {
    expect(
      evaluateClientChange({ ...base, currentStatut: "VALIDE", newClientId: "cli-B" })
    ).toBe("allowed");
  });

  test.each<DevisStatut>(["ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"])(
    "%s → blocked-status",
    (statut) => {
      expect(
        evaluateClientChange({ ...base, currentStatut: statut, newClientId: "cli-B" })
      ).toBe("blocked-status");
    }
  );

  test("VALIDE avec facture existante → blocked-factures", () => {
    expect(
      evaluateClientChange({
        ...base,
        currentStatut: "VALIDE",
        facturesCount: 1,
        newClientId: "cli-B",
      })
    ).toBe("blocked-factures");
  });

  test("priorité : statut bloquant vérifié avant les factures", () => {
    // ACCEPTE + factures : on renvoie blocked-status (1er garde-fou), pas factures.
    expect(
      evaluateClientChange({
        ...base,
        currentStatut: "ACCEPTE",
        facturesCount: 3,
        newClientId: "cli-B",
      })
    ).toBe("blocked-status");
  });
});
