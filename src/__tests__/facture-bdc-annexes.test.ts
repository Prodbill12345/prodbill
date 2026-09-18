/**
 * Tests des helpers purs d'annexion des BDC client au PDF de facture
 * (C-FACTURE-PDF-BDC, étapes 1-2).
 */

import {
  collectBdcAnnexes,
  planAnnexes,
  annexesOmissionNotice,
  formatDevisRef,
  ANNEXES_MAX_TOTAL_BYTES,
  type DevisForBdcAnnexe,
  type BdcAnnexe,
} from "../lib/facture-bdc-annexes";

function devis(
  id: string,
  overrides: Partial<DevisForBdcAnnexe> = {}
): DevisForBdcAnnexe {
  return {
    id,
    numero: `2600${id.slice(-1)}`,
    bdcClientUrl: `https://blob.vercel-storage.com/bdc-client/${id}.pdf`,
    bdcClientFilename: `BDC-${id}.pdf`,
    ...overrides,
  };
}

const MO = 1024 * 1024;

describe("collectBdcAnnexes", () => {
  test("aucun devis : liste vide", () => {
    expect(collectBdcAnnexes([])).toEqual([]);
  });

  test("devis sans BDC : écarté silencieusement", () => {
    const result = collectBdcAnnexes([
      devis("d1", { bdcClientUrl: null, bdcClientFilename: null }),
    ]);
    expect(result).toEqual([]);
  });

  test("facture mono-devis avec BDC : une annexe", () => {
    const result = collectBdcAnnexes([devis("d1")]);
    expect(result).toEqual([
      {
        devisId: "d1",
        devisNumero: "26001",
        url: "https://blob.vercel-storage.com/bdc-client/d1.pdf",
        filename: "BDC-d1.pdf",
      },
    ]);
  });

  test("récap : l'ordre des devis est conservé", () => {
    const result = collectBdcAnnexes([devis("d3"), devis("d1"), devis("d2")]);
    expect(result.map((a) => a.devisId)).toEqual(["d3", "d1", "d2"]);
  });

  test("récap mixte : seuls les devis porteurs d'un BDC sont annexés", () => {
    // Cas le plus courant en prod : une partie seulement des devis d'un
    // récap a reçu un bon de commande client.
    const result = collectBdcAnnexes([
      devis("d1"),
      devis("d2", { bdcClientUrl: null }),
      devis("d3"),
      devis("d4", { bdcClientUrl: "   " }), // url blanche = pas de BDC
    ]);
    expect(result.map((a) => a.devisId)).toEqual(["d1", "d3"]);
  });

  test("déduplication par URL : première occurrence gagnante", () => {
    const url = "https://blob.vercel-storage.com/bdc-client/partage.pdf";
    const result = collectBdcAnnexes([
      devis("d1", { bdcClientUrl: url }),
      devis("d2", { bdcClientUrl: url }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].devisId).toBe("d1");
  });

  test("filename absent : fallback non vide (messages utilisateur)", () => {
    const result = collectBdcAnnexes([devis("d1", { bdcClientFilename: null })]);
    expect(result[0].filename).toBe("bdc-client");
  });

  test("devis sans numéro : l'annexe reste collectée", () => {
    // Un devis VALIDE peut ne pas encore être numéroté — ce n'est pas une
    // raison d'écarter son BDC.
    const result = collectBdcAnnexes([devis("d1", { numero: null })]);
    expect(result).toHaveLength(1);
    expect(result[0].devisNumero).toBeNull();
  });
});

describe("planAnnexes", () => {
  const a1: BdcAnnexe = { devisId: "d1", devisNumero: "26001", url: "u1", filename: "f1.pdf" };
  const a2: BdcAnnexe = { devisId: "d2", devisNumero: "26002", url: "u2", filename: "f2.pdf" };
  const a3: BdcAnnexe = { devisId: "d3", devisNumero: "26003", url: "u3", filename: "f3.pdf" };

  test("sous le plafond : tout est inclus", () => {
    const plan = planAnnexes([a1, a2], [2 * MO, 3 * MO]);
    expect(plan.included).toEqual([a1, a2]);
    expect(plan.omitted).toEqual([]);
    expect(plan.totalBytes).toBe(5 * MO);
  });

  test("liste vide : plan vide", () => {
    expect(planAnnexes([], [])).toEqual({ included: [], omitted: [], totalBytes: 0 });
  });

  test("plafond atteint : l'excédent est omis", () => {
    const plan = planAnnexes([a1, a2], [15 * MO, 10 * MO]);
    expect(plan.included).toEqual([a1]);
    expect(plan.omitted).toEqual([a2]);
    expect(plan.totalBytes).toBe(15 * MO);
  });

  test("exactement au plafond : inclus (comparaison stricte sur le dépassement)", () => {
    const plan = planAnnexes([a1], [ANNEXES_MAX_TOTAL_BYTES]);
    expect(plan.included).toEqual([a1]);
    expect(plan.omitted).toEqual([]);
  });

  test("un octet au-dessus du plafond : omis", () => {
    const plan = planAnnexes([a1], [ANNEXES_MAX_TOTAL_BYTES + 1]);
    expect(plan.included).toEqual([]);
    expect(plan.omitted).toEqual([a1]);
  });

  test("stratégie gloutonne AVEC poursuite : une petite annexe passe après une trop grosse", () => {
    // a2 est trop lourde et saute, mais a3 tient encore dans le budget
    // restant — on privilégie le nombre de BDC joints.
    const plan = planAnnexes([a1, a2, a3], [5 * MO, 18 * MO, 1 * MO]);
    expect(plan.included).toEqual([a1, a3]);
    expect(plan.omitted).toEqual([a2]);
    expect(plan.totalBytes).toBe(6 * MO);
  });

  test("l'ordre relatif des annexes retenues suit celui des devis", () => {
    const plan = planAnnexes([a1, a2, a3], [1 * MO, 1 * MO, 1 * MO]);
    expect(plan.included.map((a) => a.devisId)).toEqual(["d1", "d2", "d3"]);
  });

  test("taille inconnue (NaN) ou négative : comptée comme 0, annexe conservée", () => {
    // Une réponse HTTP sans Content-Length ne doit pas faire sauter le
    // plafond ni faire disparaître l'annexe.
    const plan = planAnnexes([a1, a2], [Number.NaN, -1]);
    expect(plan.included).toEqual([a1, a2]);
    expect(plan.totalBytes).toBe(0);
  });

  test("plafond personnalisé respecté", () => {
    const plan = planAnnexes([a1, a2], [600, 600], 1000);
    expect(plan.included).toEqual([a1]);
    expect(plan.omitted).toEqual([a2]);
  });

  test("tailles désalignées : erreur explicite (bug d'appel)", () => {
    expect(() => planAnnexes([a1, a2], [1])).toThrow(/2 annexes pour 1 tailles/);
  });
});

describe("annexesOmissionNotice", () => {
  const a1: BdcAnnexe = { devisId: "d1", devisNumero: "26001", url: "u1", filename: "scan1.jpg" };
  const a2: BdcAnnexe = { devisId: "d2", devisNumero: null, url: "u2", filename: "scan2.pdf" };

  test("rien d'omis : pas de mention (cas normal)", () => {
    expect(annexesOmissionNotice([])).toBeNull();
  });

  test("une annexe omise : singulier, devis et fichier nommés", () => {
    const notice = annexesOmissionNotice([a1]);
    expect(notice).toContain("1 bon de commande n'a pas pu être joint");
    expect(notice).toContain("D26001");
    expect(notice).toContain("scan1.jpg");
    expect(notice).toContain("20 Mo");
    expect(notice).toContain("Ce document reste téléchargeable");
  });

  test("plusieurs annexes omises : pluriel et liste complète", () => {
    const notice = annexesOmissionNotice([a1, a2]);
    expect(notice).toContain("2 bons de commande n'ont pas pu être joints");
    expect(notice).toContain("D26001");
    expect(notice).toContain("scan2.pdf");
    expect(notice).toContain("Ces documents restent téléchargeables");
  });

  test("devis sans numéro : référence lisible, pas de 'Dnull'", () => {
    const notice = annexesOmissionNotice([a2]);
    expect(notice).toContain("(devis sans numéro)");
    expect(notice).not.toContain("Dnull");
  });

  test("plafond personnalisé repris dans la mention", () => {
    const notice = annexesOmissionNotice([a1], 5 * MO);
    expect(notice).toContain("5 Mo");
  });
});

describe("formatDevisRef", () => {
  test("numéro présent : préfixe D", () => {
    expect(formatDevisRef("26001")).toBe("D26001");
  });

  test("numéro absent : libellé explicite", () => {
    expect(formatDevisRef(null)).toBe("(devis sans numéro)");
  });
});
