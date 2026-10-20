/**
 * Tests BUG-DEVIS-EDIT-CLIENT.
 *
 * 1. Régression schéma : le PUT retenait `clientId` (avant le fix, zod le
 *    strippait → le changement de client ne persistait jamais).
 * 2. Règle métier evaluateClientChange (FIX-CLIENT-CHANGE-ENVOYE) : client
 *    modifiable sur tout statut, bloqué dès qu'une facture (mono ou récap)
 *    est liée.
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
    "%s, sans facture, nouveau client → allowed (FIX-CLIENT-CHANGE-ENVOYE)",
    (statut) => {
      expect(
        evaluateClientChange({ ...base, currentStatut: statut, newClientId: "cli-B" })
      ).toBe("allowed");
    }
  );

  test.each<DevisStatut>(["VALIDE", "ENVOYE", "ACCEPTE"])(
    "%s avec facture mono existante → blocked-factures",
    (statut) => {
      expect(
        evaluateClientChange({
          ...base,
          currentStatut: statut,
          facturesCount: 1,
          newClientId: "cli-B",
        })
      ).toBe("blocked-factures");
    }
  );

  test.each<DevisStatut>(["ENVOYE", "ACCEPTE"])(
    "%s membre d'une facture récap (factureLinksCount>0) → blocked-factures",
    (statut) => {
      expect(
        evaluateClientChange({
          ...base,
          currentStatut: statut,
          facturesCount: 0,
          factureLinksCount: 1,
          newClientId: "cli-B",
        })
      ).toBe("blocked-factures");
    }
  );

  // #99 : appartenance à une facture récapitulative (lien FactureDevis) sans
  // facture mono (devisId non renseigné → facturesCount = 0).
  test("VALIDE, membre d'une facture récap (factureLinksCount>0) → blocked-factures", () => {
    expect(
      evaluateClientChange({
        ...base,
        currentStatut: "VALIDE",
        facturesCount: 0,
        factureLinksCount: 1,
        newClientId: "cli-B",
      })
    ).toBe("blocked-factures");
  });

  test("factureLinksCount omis (appelant pré-#99) → défaut 0, comportement inchangé", () => {
    expect(
      evaluateClientChange({
        ...base,
        currentStatut: "VALIDE",
        facturesCount: 0,
        newClientId: "cli-B",
      })
    ).toBe("allowed");
  });

  test("les deux comptes non nuls (facture mono + lien) → blocked-factures", () => {
    expect(
      evaluateClientChange({
        ...base,
        currentStatut: "BROUILLON",
        facturesCount: 1,
        factureLinksCount: 1,
        newClientId: "cli-B",
      })
    ).toBe("blocked-factures");
  });
});
