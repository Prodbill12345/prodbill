/**
 * C-DEVIS-SECTIONS-REORDER : réordonnancement des sections du DevisBuilder.
 * Ordre persisté via `ordre` (= position affichée) ; bloqué dès qu'une
 * facture est liée au devis, comme le changement de client.
 */

import {
  isDevisFactureLocked,
  evaluateSectionReorder,
  SECTIONS_REORDER_BLOCKED_MESSAGE,
  moveItem,
  moveIndexSet,
  buildSectionsPayload,
} from "../lib/devis-sections";
import { evaluateClientChange } from "../lib/devis-client-change";

const EXISTING = ["sec-voix", "sec-studio", "sec-musique"];

describe("evaluateSectionReorder", () => {
  const noFacture = { facturesCount: 0, factureLinksCount: 0 };

  test("même ordre → no-change", () => {
    expect(
      evaluateSectionReorder({ existingSectionIds: EXISTING, incomingSourceIds: EXISTING, ...noFacture })
    ).toBe("no-change");
  });

  test("sections échangées, aucune facture → allowed", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: ["sec-studio", "sec-voix", "sec-musique"],
        ...noFacture,
      })
    ).toBe("allowed");
  });

  test("ajout d'une section nouvelle (sans sourceId) → no-change", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: [...EXISTING, undefined],
        facturesCount: 1,
      })
    ).toBe("no-change");
  });

  test("suppression d'une section → no-change (ordre relatif conservé)", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: ["sec-voix", "sec-musique"],
        facturesCount: 1,
      })
    ).toBe("no-change");
  });

  test("payload sans sourceId (appelant antérieur) → no-change", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: [undefined, undefined, undefined],
        facturesCount: 1,
      })
    ).toBe("no-change");
  });

  test("devis facturé (facture mono) + réordonnancement → blocked-factures", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: ["sec-musique", "sec-voix", "sec-studio"],
        facturesCount: 1,
        factureLinksCount: 0,
      })
    ).toBe("blocked-factures");
  });

  test("devis dans une facture récap (#99) + réordonnancement → blocked-factures", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: ["sec-studio", "sec-voix", "sec-musique"],
        facturesCount: 0,
        factureLinksCount: 1,
      })
    ).toBe("blocked-factures");
  });

  test("devis facturé sans réordonnancement → no-change (le reste de la sauvegarde passe)", () => {
    expect(
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: EXISTING,
        facturesCount: 2,
        factureLinksCount: 1,
      })
    ).toBe("no-change");
  });
});

describe("même règle que le changement de client", () => {
  test.each([
    [0, 0],
    [1, 0],
    [0, 1],
    [2, 3],
  ])("factures=%i, liens récap=%i : verrous identiques", (facturesCount, factureLinksCount) => {
    const clientBlocked =
      evaluateClientChange({
        currentClientId: "c1",
        currentStatut: "ACCEPTE",
        facturesCount,
        factureLinksCount,
        newClientId: "c2",
      }) === "blocked-factures";
    const reorderBlocked =
      evaluateSectionReorder({
        existingSectionIds: EXISTING,
        incomingSourceIds: ["sec-studio", "sec-voix", "sec-musique"],
        facturesCount,
        factureLinksCount,
      }) === "blocked-factures";
    expect(reorderBlocked).toBe(clientBlocked);
    expect(isDevisFactureLocked({ facturesCount, factureLinksCount })).toBe(clientBlocked);
  });

  test("message parallèle à celui du client", () => {
    expect(SECTIONS_REORDER_BLOCKED_MESSAGE).toBe(
      "Impossible de réordonner les sections : une facture a déjà été créée depuis ce devis."
    );
  });
});

describe("moveItem / moveIndexSet", () => {
  test("déplace vers le bas et vers le haut", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  test("hors bornes ou identique → copie inchangée", () => {
    const src = ["a", "b"];
    const out = moveItem(src, 0, 5);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });

  test("l'état déplié suit la section déplacée", () => {
    // Section 0 dépliée, déplacée en position 2.
    expect([...moveIndexSet(new Set([0]), 3, 0, 2)]).toEqual([2]);
    // Sections 0 et 2 dépliées, la 2 remonte en tête.
    expect([...moveIndexSet(new Set([0, 2]), 3, 2, 0)].sort()).toEqual([0, 1]);
  });
});

describe("buildSectionsPayload", () => {
  const sections = [
    {
      sourceId: "sec-voix",
      titre: "Voix-Off",
      lignes: [
        { libelle: "Comédien", quantite: "1", prixUnit: "550", comedienId: "", agentId: "ag1" },
        { libelle: "Agent", quantite: 1, prixUnit: 55, comedienId: null, agentId: undefined },
      ],
    },
    {
      sourceId: "sec-studio",
      titre: "Studio",
      lignes: [{ libelle: "Mixage", quantite: 2, prixUnit: 135, comedienId: undefined, agentId: "" }],
    },
  ];

  test("ordre = position affichée, après déplacement", () => {
    const payload = buildSectionsPayload(moveItem(sections, 1, 0));
    expect(payload.map((s) => [s.titre, s.ordre, s.sourceId])).toEqual([
      ["Studio", 0, "sec-studio"],
      ["Voix-Off", 1, "sec-voix"],
    ]);
    // Les lignes gardent leur ordre interne et leur numérotation.
    expect(payload[1].lignes.map((l) => [l.libelle, l.ordre])).toEqual([
      ["Comédien", 0],
      ["Agent", 1],
    ]);
  });

  test("conversions inchangées : nombres, FK vides → undefined", () => {
    const [voix] = buildSectionsPayload(sections);
    expect(voix.lignes[0]).toMatchObject({ quantite: 1, prixUnit: 550, comedienId: undefined, agentId: "ag1" });
    expect(voix.lignes[1]).toMatchObject({ comedienId: undefined, agentId: undefined });
  });
});
