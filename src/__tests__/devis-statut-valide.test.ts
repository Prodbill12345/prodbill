/**
 * Tests du statut VALIDE (#96) — validation interne, sans envoi mail.
 * Ordre métier : BROUILLON → VALIDE → ENVOYE → ACCEPTE → REFUSE → EXPIRE.
 */

import type { DevisStatut } from "@prisma/client";
import { DEVIS_STATUT_LABELS, DEVIS_STATUT_COLORS } from "../types";
import {
  filterDevis,
  DEVIS_SORT_ACCESSORS,
  type DevisFilterable,
} from "../lib/devis-filters";

function mkDevis(over: Partial<DevisFilterable>): DevisFilterable {
  return {
    numero: "26001",
    objet: "Objet",
    client: { name: "Client" },
    statut: "BROUILLON",
    annee: null,
    dateEmission: null,
    totalTtc: 0,
    ...over,
  };
}

describe("VALIDE — labels & couleurs présents", () => {
  test('label = "Validé"', () => {
    expect(DEVIS_STATUT_LABELS.VALIDE).toBe("Validé");
  });

  test("couleur définie et distincte d'ACCEPTE", () => {
    expect(DEVIS_STATUT_COLORS.VALIDE).toBeTruthy();
    expect(DEVIS_STATUT_COLORS.VALIDE).not.toBe(DEVIS_STATUT_COLORS.ACCEPTE);
  });

  test("les 6 statuts sont couverts (labels + couleurs)", () => {
    const statuts: DevisStatut[] = [
      "BROUILLON",
      "VALIDE",
      "ENVOYE",
      "ACCEPTE",
      "REFUSE",
      "EXPIRE",
    ];
    for (const s of statuts) {
      expect(DEVIS_STATUT_LABELS[s]).toBeTruthy();
      expect(DEVIS_STATUT_COLORS[s]).toBeTruthy();
    }
  });
});

describe("VALIDE — filtre liste", () => {
  test("filtre statut=VALIDE ne renvoie que les devis validés", () => {
    const list = [
      mkDevis({ objet: "a", statut: "VALIDE" }),
      mkDevis({ objet: "b", statut: "BROUILLON" }),
      mkDevis({ objet: "c", statut: "VALIDE" }),
    ];
    const out = filterDevis(list, { statut: "VALIDE" });
    expect(out.map((d) => d.objet)).toEqual(["a", "c"]);
  });
});

describe("VALIDE — ordre de tri métier", () => {
  const orderOf = (statut: DevisStatut) =>
    DEVIS_SORT_ACCESSORS.statut(mkDevis({ statut })) as number;

  test("BROUILLON < VALIDE < ENVOYE < ACCEPTE", () => {
    expect(orderOf("BROUILLON")).toBeLessThan(orderOf("VALIDE"));
    expect(orderOf("VALIDE")).toBeLessThan(orderOf("ENVOYE"));
    expect(orderOf("ENVOYE")).toBeLessThan(orderOf("ACCEPTE"));
  });
});
