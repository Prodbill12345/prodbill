/**
 * Tests de devisRecapVisibility (#hide-tva NONNA).
 * hideTvaTtcOnDevis=false (défaut) → TVA + TTC visibles.
 * hideTvaTtcOnDevis=true (NONNA)   → TVA + TTC masqués, Total HT conservé.
 */

import { devisRecapVisibility } from "../lib/devis-recap-visibility";

describe("devisRecapVisibility", () => {
  test("défaut (false) → TVA et TTC visibles", () => {
    expect(devisRecapVisibility({ hideTvaTtcOnDevis: false })).toEqual({
      showTva: true,
      showTtc: true,
    });
  });

  test("NONNA (true) → TVA et TTC masqués", () => {
    expect(devisRecapVisibility({ hideTvaTtcOnDevis: true })).toEqual({
      showTva: false,
      showTtc: false,
    });
  });
});
