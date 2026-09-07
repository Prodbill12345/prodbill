/**
 * Tests de isDevisFacturable (#97, élargi #99) — un devis est facturable dès
 * VALIDE (validation interne), ENVOYE (cas réel Vanda : pas d'acceptation
 * formelle in-app) ou ACCEPTE. Source unique route + UI (mono et récap).
 */

import type { DevisStatut } from "@prisma/client";
import { isDevisFacturable } from "../lib/devis-facturable";

describe("isDevisFacturable", () => {
  test.each<DevisStatut>(["VALIDE", "ENVOYE", "ACCEPTE"])(
    "%s → facturable",
    (statut) => {
      expect(isDevisFacturable(statut)).toBe(true);
    }
  );

  // #99 : ENVOYE devient facturable (aligné mono/récap). BROUILLON (pas encore
  // émis) et les états terminaux REFUSE/EXPIRE restent exclus.
  test.each<DevisStatut>(["BROUILLON", "REFUSE", "EXPIRE"])(
    "%s → non facturable",
    (statut) => {
      expect(isDevisFacturable(statut)).toBe(false);
    }
  );
});
