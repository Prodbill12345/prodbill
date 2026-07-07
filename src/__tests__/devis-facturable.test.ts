/**
 * Tests de isDevisFacturable (#97) — un devis est facturable dès VALIDE
 * (validation interne) ou ACCEPTE. Source unique route + UI.
 */

import type { DevisStatut } from "@prisma/client";
import { isDevisFacturable } from "../lib/devis-facturable";

describe("isDevisFacturable", () => {
  test("VALIDE → facturable", () => {
    expect(isDevisFacturable("VALIDE")).toBe(true);
  });

  test("ACCEPTE → facturable", () => {
    expect(isDevisFacturable("ACCEPTE")).toBe(true);
  });

  test.each<DevisStatut>(["BROUILLON", "ENVOYE", "REFUSE", "EXPIRE"])(
    "%s → non facturable",
    (statut) => {
      expect(isDevisFacturable(statut)).toBe(false);
    }
  );
});
